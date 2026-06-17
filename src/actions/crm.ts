"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAgency, requireClient } from "@/lib/auth";
import { signTaskAttachments } from "@/lib/comment-attachments";
import { DOSSIER_SECTIONS, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { ensureTaskWatchers, findMentionedMemberIds, notifyTaskAudience } from "@/lib/notifications";
import { advanceRecurringDate, moveToWeekday, recurringOccurrence } from "@/lib/recurrence";
import { createAdminClient } from "@/lib/supabase/admin";
import { TASK_DETAIL_SELECT } from "@/lib/task-selects";
import { dateInputValue } from "@/lib/utils";

const clientSchema = z.object({
  name: z.string().trim().min(1),
  company_name: z.string().trim().optional(),
  contact_name: z.string().trim().optional(),
  contact_email: z.string().trim().optional(),
  website: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  status: z.enum(["active", "paused"]).default("active"),
});

const optional = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim() || null;

function requireClientLifecycleAdmin(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new Error("Only agency owners and admins can archive, restore, or delete clients.");
  }
}

const attachmentSchema = z.object({
  storage_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
  content_type: z.string().max(255).nullable(),
  size_bytes: z.number().int().nonnegative().max(104857600),
});

function isMissingCommentRequestIdColumn(error: { code?: string; message?: string } | null) {
  return Boolean(
    error
    && (
      error.code === "42703"
      || error.code === "PGRST204"
      || error.message?.includes("client_request_id")
    )
  );
}

async function defaultTaskListId(
  context: Awaited<ReturnType<typeof requireClient>>,
  kind: "general" | "recurring" = "general",
) {
  const { data, error } = await context.supabase
    .from("task_lists")
    .select("id")
    .eq("agency_id", context.agency.id)
    .eq("client_id", context.client.id)
    .eq("kind", kind)
    .is("archived_at", null)
    .single();
  if (error) throw new Error(`Missing ${kind} task list: ${error.message}`);
  return data.id;
}

export async function createClient(formData: FormData) {
  const context = await requireAgency();
  const parsed = clientSchema.parse(Object.fromEntries(formData));
  const { data: client, error } = await context.supabase
    .from("clients")
    .insert({ ...parsed, agency_id: context.agency.id })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const { error: setupError } = await context.supabase.from("task_lists").insert([
    { agency_id: context.agency.id, client_id: client.id, name: "General", kind: "general" },
    { agency_id: context.agency.id, client_id: client.id, name: "Recurring", kind: "recurring" },
  ]);
  if (setupError) throw new Error(setupError.message);

  const { error: dossierError } = await context.supabase
    .from("dossiers")
    .insert({ agency_id: context.agency.id, client_id: client.id });
  if (dossierError) throw new Error(dossierError.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId: client.id,
    action: "client.created",
    entityType: "client",
    entityId: client.id,
  });
  revalidatePath("/", "layout");
  redirect(`/clients/${client.id}?tab=tasks&list=general`);
}

export async function updateClient(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const context = await requireClient(clientId);
  if (context.client.status === "archived") {
    throw new Error("Restore this client before editing its details.");
  }
  const parsed = clientSchema.parse(Object.fromEntries(formData));
  const { error } = await context.supabase
    .from("clients")
    .update(parsed)
    .eq("id", clientId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);

  if (context.client.status === "paused" && parsed.status === "active") {
    const { error: rulesError } = await context.supabase
      .from("recurring_task_rules")
      .update({ next_run_at: dateInputValue() })
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
      .eq("active", true)
      .lt("next_run_at", dateInputValue());
    if (rulesError) throw new Error(rulesError.message);
  }

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "client.updated",
    entityType: "client",
    entityId: clientId,
  });
  revalidatePath("/", "layout");
  revalidatePath(`/clients/${clientId}`);
}

function revalidateClientLifecycle(clientId: string) {
  revalidatePath("/", "layout");
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
  revalidatePath("/creative-master");
}

export async function archiveClientWorkspace(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const context = await requireClient(clientId);
  requireClientLifecycleAdmin(context.membership.role);
  if (context.client.status === "archived") throw new Error("Client is already archived.");

  const { data, error } = await context.supabase.rpc("archive_client_workspace", {
    target_agency_id: context.agency.id,
    target_client_id: clientId,
    target_archived_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "client.archived",
    entityType: "client",
    entityId: clientId,
    metadata: { name: context.client.name, affected: data },
  });
  revalidateClientLifecycle(clientId);
}

export async function restoreClientWorkspace(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const context = await requireClient(clientId);
  requireClientLifecycleAdmin(context.membership.role);
  if (context.client.status !== "archived") throw new Error("Client is not archived.");

  const { data, error } = await context.supabase.rpc("restore_client_workspace", {
    target_agency_id: context.agency.id,
    target_client_id: clientId,
  });
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "client.restored",
    entityType: "client",
    entityId: clientId,
    metadata: { name: context.client.name, restored: data },
  });
  revalidateClientLifecycle(clientId);
}

export async function deleteClient(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const context = await requireClient(clientId);
  requireClientLifecycleAdmin(context.membership.role);
  if (context.client.status !== "archived") {
    throw new Error("Archive this client before deleting it permanently.");
  }

  const { data: tasks, error: tasksError } = await context.supabase
    .from("tasks")
    .select("task_comments(task_comment_attachments(storage_path))")
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId);
  if (tasksError) throw new Error(tasksError.message);

  const attachmentPaths = (tasks ?? []).flatMap((task) => {
    const comments = task.task_comments as unknown as Array<{
      task_comment_attachments: Array<{ storage_path: string }>;
    }>;
    return (comments ?? []).flatMap((comment) =>
      (comment.task_comment_attachments ?? []).map((attachment) => attachment.storage_path),
    );
  });

  const { data: deletedClient, error } = await context.supabase
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("agency_id", context.agency.id)
    .eq("status", "archived")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!deletedClient) throw new Error("Archived client was not deleted. Refresh and try again.");

  if (attachmentPaths.length) {
    try {
      const { error: storageError } = await createAdminClient().storage
        .from("comment-attachments")
        .remove(attachmentPaths);
      if (storageError) console.error("Deleted client attachment cleanup failed:", storageError.message);
    } catch (storageError) {
      console.error("Deleted client attachment cleanup failed:", storageError);
    }
  }

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "client.deleted",
    entityType: "client",
    entityId: clientId,
    metadata: { name: context.client.name },
  });
  revalidateClientLifecycle(clientId);
}

export async function createTaskList(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const context = await requireClient(clientId);
  const name = z.string().trim().min(1).max(100).parse(formData.get("name"));
  const { data: list, error } = await context.supabase
    .from("task_lists")
    .insert({
      agency_id: context.agency.id,
      client_id: clientId,
      name,
      kind: "custom",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task_list.created",
    entityType: "task_list",
    entityId: list.id,
    metadata: { name },
  });
  revalidatePath(`/clients/${clientId}`);
  return { listId: list.id };
}

export async function archiveTaskList(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const listId = String(formData.get("list_id"));
  const context = await requireClient(clientId);
  const { data: list } = await context.supabase
    .from("task_lists")
    .select("id, kind, name")
    .eq("id", listId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (!list || list.kind !== "custom") throw new Error("Only custom task lists can be archived.");

  const archivedAt = new Date().toISOString();
  const { error: tasksError } = await context.supabase
    .from("tasks")
    .update({ archived_at: archivedAt })
    .eq("task_list_id", listId)
    .eq("agency_id", context.agency.id);
  if (tasksError) throw new Error(tasksError.message);
  const { error: rulesError } = await context.supabase
    .from("recurring_task_rules")
    .update({ active: false })
    .eq("task_list_id", listId)
    .eq("agency_id", context.agency.id);
  if (rulesError) throw new Error(rulesError.message);
  const { error: listError } = await context.supabase
    .from("task_lists")
    .update({ archived_at: archivedAt })
    .eq("id", listId)
    .eq("agency_id", context.agency.id);
  if (listError) throw new Error(listError.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task_list.archived",
    entityType: "task_list",
    entityId: listId,
    metadata: { name: list.name },
  });
  redirect(`/clients/${clientId}?tab=tasks&list=general`);
}

export async function deleteTaskList(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const listId = String(formData.get("list_id"));
  const context = await requireClient(clientId);
  const { data: list } = await context.supabase
    .from("task_lists")
    .select("id, kind")
    .eq("id", listId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (!list || list.kind !== "custom") throw new Error("Only custom task lists can be deleted.");

  const { count } = await context.supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("task_list_id", listId)
    .eq("agency_id", context.agency.id);
  if (count) throw new Error("Archive this list instead. Lists containing tasks cannot be deleted.");
  const { count: ruleCount } = await context.supabase
    .from("recurring_task_rules")
    .select("id", { count: "exact", head: true })
    .eq("task_list_id", listId)
    .eq("agency_id", context.agency.id);
  if (ruleCount) throw new Error("Archive this list instead. Lists used by recurring rules cannot be deleted.");

  const { error } = await context.supabase
    .from("task_lists")
    .delete()
    .eq("id", listId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);
  redirect(`/clients/${clientId}?tab=tasks&list=general`);
}

async function validateTaskRelations(
  context: Awaited<ReturnType<typeof requireClient>>,
  taskListId: string | null,
  parentTaskId: string | null,
) {
  if (taskListId) {
    const { data } = await context.supabase
      .from("task_lists")
      .select("id")
      .eq("id", taskListId)
      .eq("client_id", context.client.id)
      .eq("agency_id", context.agency.id)
      .is("archived_at", null)
      .maybeSingle();
    if (!data) throw new Error("Invalid task list.");
  }
  if (parentTaskId) {
    const { data } = await context.supabase
      .from("tasks")
      .select("id")
      .eq("id", parentTaskId)
      .eq("client_id", context.client.id)
      .eq("agency_id", context.agency.id)
      .is("archived_at", null)
      .neq("status", "complete")
      .maybeSingle();
    if (!data) throw new Error("Parent task must be open and active.");
  }
}

async function validateParentChain(
  context: Awaited<ReturnType<typeof requireClient>>,
  taskId: string,
  parentTaskId: string | null,
) {
  let currentId = parentTaskId;
  const visited = new Set<string>();
  while (currentId) {
    if (currentId === taskId) throw new Error("A task cannot be moved beneath itself or one of its subtasks.");
    if (visited.has(currentId)) throw new Error("This task hierarchy already contains a cycle.");
    visited.add(currentId);
    if (visited.size > 100) throw new Error("This task hierarchy is too deeply nested.");

    const { data: parent, error } = await context.supabase
      .from("tasks")
      .select("parent_task_id")
      .eq("id", currentId)
      .eq("client_id", context.client.id)
      .eq("agency_id", context.agency.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    currentId = parent?.parent_task_id ?? null;
  }
}

async function moveTaskTreeToList(
  context: Awaited<ReturnType<typeof requireClient>>,
  taskId: string,
  taskListId: string,
) {
  const { data, error } = await context.supabase.rpc("move_task_tree_to_list", {
    target_agency_id: context.agency.id,
    target_client_id: context.client.id,
    target_task_id: taskId,
    target_task_list_id: taskListId,
  });
  if (error) throw new Error(error.message);

  const movedTasks = (data ?? []) as Array<{ id: string; title: string }>;
  if (!movedTasks.some((task) => task.id === taskId)) throw new Error("Task not found.");
  return movedTasks;
}

export async function createTask(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const context = await requireClient(clientId);
  const title = z.string().trim().min(1).parse(formData.get("title"));
  const taskListId = optional(formData, "task_list_id") ?? await defaultTaskListId(context);
  const parentTaskId = optional(formData, "parent_task_id");
  await validateTaskRelations(context, taskListId, parentTaskId);

  const { data: task, error } = await context.supabase
    .from("tasks")
    .insert({
      agency_id: context.agency.id,
      client_id: clientId,
      task_list_id: taskListId,
      parent_task_id: parentTaskId,
      title,
      description: optional(formData, "description"),
      status: z.enum(TASK_STATUSES).parse(formData.get("status") || "todo"),
      priority: z.enum(TASK_PRIORITIES).parse(formData.get("priority") || "normal"),
      assignee_id: optional(formData, "assignee_id"),
      start_date: optional(formData, "start_date"),
      due_date: optional(formData, "due_date"),
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await ensureTaskWatchers({
    agencyId: context.agency.id,
    taskId: task.id,
    userIds: [context.user.id],
  });
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task.created",
    entityType: "task",
    entityId: task.id,
    metadata: { title },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
}

export async function updateTask(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const taskId = String(formData.get("task_id"));
  const context = await requireClient(clientId);
  const taskListId = optional(formData, "task_list_id") ?? await defaultTaskListId(context);
  const parentTaskId = optional(formData, "parent_task_id");
  const nextStatus = z.enum(TASK_STATUSES).parse(formData.get("status"));
  const { data: currentTask } = await context.supabase
    .from("tasks")
    .select("id, title, status, parent_task_id, task_list_id")
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (!currentTask) throw new Error("Task not found.");
  await validateTaskRelations(
    context,
    taskListId,
    parentTaskId !== currentTask.parent_task_id ? parentTaskId : null,
  );
  if (parentTaskId !== currentTask.parent_task_id) {
    await validateParentChain(context, taskId, parentTaskId);
  }
  const movedTasks = taskListId !== currentTask.task_list_id
    ? await moveTaskTreeToList(context, taskId, taskListId)
    : [];

  const { error } = await context.supabase
    .from("tasks")
    .update({
      title: z.string().trim().min(1).parse(formData.get("title")),
      description: optional(formData, "description"),
      status: nextStatus,
      priority: z.enum(TASK_PRIORITIES).parse(formData.get("priority")),
      assignee_id: optional(formData, "assignee_id"),
      task_list_id: taskListId,
      parent_task_id: parentTaskId,
      start_date: optional(formData, "start_date"),
      due_date: optional(formData, "due_date"),
    })
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task.updated",
    entityType: "task",
    entityId: taskId,
    metadata: movedTasks.length ? { moved_descendant_count: movedTasks.length - 1 } : undefined,
  });
  if (currentTask.status !== nextStatus) {
    await notifyTaskAudience({
      supabase: context.supabase,
      agencyId: context.agency.id,
      actorId: context.user.id,
      actorName: context.membership.display_name || context.membership.email || context.user.email || "A teammate",
      clientId,
      taskId,
      taskTitle: currentTask.title,
      kind: "status_changed",
      body: `Status changed from ${currentTask.status.replaceAll("_", " ")} to ${nextStatus.replaceAll("_", " ")}.`,
      metadata: { from_status: currentTask.status, to_status: nextStatus },
    });
  }
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
  revalidatePath("/inbox");
}

const editableTaskFields = [
  "title",
  "description",
  "status",
  "priority",
  "assignee_id",
  "task_list_id",
  "parent_task_id",
  "start_date",
  "due_date",
] as const;

export async function updateTaskField(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const taskId = z.string().uuid().parse(formData.get("task_id"));
  const field = z.enum(editableTaskFields).parse(formData.get("field"));
  const rawValue = optional(formData, "value");
  const context = await requireClient(clientId);
  let value: string | null = rawValue;
  const { data: previousTask } = await context.supabase
    .from("tasks")
    .select("id, title, status")
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (!previousTask) throw new Error("Task not found.");

  if (field === "title") value = z.string().trim().min(1).max(500).parse(rawValue);
  if (field === "description") value = rawValue ? z.string().max(100000).parse(rawValue) : null;
  if (field === "status") value = z.enum(TASK_STATUSES).parse(rawValue);
  if (field === "priority") value = z.enum(TASK_PRIORITIES).parse(rawValue);
  if ((field === "start_date" || field === "due_date") && rawValue) {
    value = z.string().date().parse(rawValue);
  }
  if (field === "task_list_id") {
    value = rawValue ?? await defaultTaskListId(context);
    await validateTaskRelations(context, value, null);
  }
  if (field === "parent_task_id") {
    await validateTaskRelations(context, null, rawValue);
    await validateParentChain(context, taskId, rawValue);
  }
  if (field === "assignee_id" && rawValue) {
    const { data: member } = await context.supabase
      .from("agency_members")
      .select("user_id")
      .eq("agency_id", context.agency.id)
      .eq("user_id", rawValue)
      .maybeSingle();
    if (!member) throw new Error("Invalid assignee.");
  }

  let updatedTask: { id: string; title: string } | null = null;
  let movedDescendantCount = 0;
  if (field === "task_list_id") {
    if (!value) throw new Error("Task list is required.");
    const movedTasks = await moveTaskTreeToList(context, taskId, value);
    updatedTask = movedTasks.find((task) => task.id === taskId) ?? null;
    movedDescendantCount = movedTasks.length - 1;
  } else {
    const { data, error } = await context.supabase
      .from("tasks")
      .update({ [field]: value })
      .eq("id", taskId)
      .eq("client_id", clientId)
      .eq("agency_id", context.agency.id)
      .select("id, title")
      .maybeSingle();
    if (error) throw new Error(error.message);
    updatedTask = data;
  }
  if (!updatedTask) throw new Error("Task not found.");

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task.field_updated",
    entityType: "task",
    entityId: taskId,
    metadata: { field, ...(field === "task_list_id" ? { moved_descendant_count: movedDescendantCount } : {}) },
  });
  if (field === "status" && previousTask.status !== value) {
    await notifyTaskAudience({
      supabase: context.supabase,
      agencyId: context.agency.id,
      actorId: context.user.id,
      actorName: context.membership.display_name || context.membership.email || context.user.email || "A teammate",
      clientId,
      taskId,
      taskTitle: updatedTask.title,
      kind: "status_changed",
      body: `Status changed from ${previousTask.status.replaceAll("_", " ")} to ${String(value).replaceAll("_", " ")}.`,
      metadata: { from_status: previousTask.status, to_status: value },
    });
  }
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
  revalidatePath("/inbox");
}

export async function updateTaskDates(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const taskId = z.string().uuid().parse(formData.get("task_id"));
  const rawStartDate = optional(formData, "start_date");
  const rawDueDate = optional(formData, "due_date");
  const startDate = rawStartDate ? z.string().date().parse(rawStartDate) : null;
  const dueDate = rawDueDate ? z.string().date().parse(rawDueDate) : null;
  if (startDate && dueDate && dueDate < startDate) {
    throw new Error("Due date cannot be before start date.");
  }

  const context = await requireClient(clientId);
  const { data: task, error } = await context.supabase
    .from("tasks")
    .update({ start_date: startDate, due_date: dueDate })
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task) throw new Error("Task not found.");

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task.dates_updated",
    entityType: "task",
    entityId: taskId,
    metadata: { start_date: startDate, due_date: dueDate },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
}

export async function getTaskDetail(input: unknown) {
  const parsed = z.object({
    clientId: z.string().uuid(),
    taskId: z.string().uuid(),
  }).parse(input);
  const context = await requireClient(parsed.clientId);
  const { data: task, error } = await context.supabase
    .from("tasks")
    .select(TASK_DETAIL_SELECT)
    .eq("id", parsed.taskId)
    .eq("client_id", parsed.clientId)
    .eq("agency_id", context.agency.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task) throw new Error("Task not found.");
  await signTaskAttachments([task as {
    task_comments?: Array<{
      task_comment_attachments?: Array<{
        storage_path: string;
        signed_url?: string;
      }>;
    }>;
  }]);
  return task;
}

const taskRecurrenceSchema = z.object({
  clientId: z.string().uuid(),
  taskId: z.string().uuid(),
  startDate: z.string().date(),
  dueDate: z.string().date(),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  intervalCount: z.number().int().positive().max(365),
  skipWeekends: z.boolean(),
});

export async function getTaskRecurrence(input: unknown) {
  const parsed = z.object({
    clientId: z.string().uuid(),
    taskId: z.string().uuid(),
  }).parse(input);
  const context = await requireClient(parsed.clientId);
  const { data: task, error: taskError } = await context.supabase
    .from("tasks")
    .select("source_recurring_rule_id")
    .eq("id", parsed.taskId)
    .eq("client_id", parsed.clientId)
    .eq("agency_id", context.agency.id)
    .is("archived_at", null)
    .maybeSingle();
  if (taskError) throw new Error(taskError.message);
  if (!task) throw new Error("Task not found.");
  if (!task.source_recurring_rule_id) return null;

  const { data: rule, error } = await context.supabase
    .from("recurring_task_rules")
    .select("id, frequency, interval_count, skip_weekends, active")
    .eq("id", task.source_recurring_rule_id)
    .eq("agency_id", context.agency.id)
    .eq("client_id", parsed.clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return rule;
}

export async function setTaskRecurrence(input: unknown) {
  const parsed = taskRecurrenceSchema.parse(input);
  if (parsed.dueDate < parsed.startDate) throw new Error("Due date cannot be before start date.");
  const context = await requireClient(parsed.clientId);
  if (context.client.status !== "active") throw new Error("Recurring work can only be enabled for active clients.");

  const { data: task, error: taskError } = await context.supabase
    .from("tasks")
    .select("id, title, description, status, priority, assignee_id, parent_task_id, task_list_id, source_recurring_rule_id, occurrence_date, start_date, due_date")
    .eq("id", parsed.taskId)
    .eq("client_id", parsed.clientId)
    .eq("agency_id", context.agency.id)
    .is("archived_at", null)
    .maybeSingle();
  if (taskError) throw new Error(taskError.message);
  if (!task) throw new Error("Task not found.");
  if (task.status === "complete") throw new Error("Reopen this task before making it recurring.");
  if (task.parent_task_id) throw new Error("Detach this subtask from its parent before making it recurring.");

  const { count: subtaskCount, error: subtaskError } = await context.supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", context.agency.id)
    .eq("client_id", parsed.clientId)
    .eq("parent_task_id", parsed.taskId)
    .is("archived_at", null);
  if (subtaskError) throw new Error(subtaskError.message);
  if (subtaskCount) {
    throw new Error("Tasks with subtasks cannot recur yet because future occurrences would not include those subtasks.");
  }

  const recurringListId = await defaultTaskListId(context, "recurring");
  const dueOffsetDays = Math.round(
    (new Date(`${parsed.dueDate}T12:00:00Z`).getTime() - new Date(`${parsed.startDate}T12:00:00Z`).getTime()) / 86400000,
  );
  const occurrence = recurringOccurrence(parsed.startDate, dueOffsetDays, parsed.skipWeekends);
  const nextRunAt = advanceRecurringDate(
    occurrence.occurrenceDate,
    parsed.frequency,
    parsed.intervalCount,
    parsed.skipWeekends,
  );
  const ruleValues = {
    task_list_id: recurringListId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    assignee_id: task.assignee_id,
    frequency: parsed.frequency,
    interval_count: parsed.intervalCount,
    next_run_at: nextRunAt,
    due_offset_days: dueOffsetDays,
    skip_weekends: parsed.skipWeekends,
    active: true,
  };

  let ruleId = task.source_recurring_rule_id;
  const { data: previousRule, error: previousRuleError } = ruleId
    ? await context.supabase
      .from("recurring_task_rules")
      .select("task_list_id, title, description, priority, assignee_id, frequency, interval_count, next_run_at, due_offset_days, skip_weekends, active")
      .eq("id", ruleId)
      .eq("agency_id", context.agency.id)
      .eq("client_id", parsed.clientId)
      .maybeSingle()
    : { data: null, error: null };
  if (previousRuleError) throw new Error(previousRuleError.message);
  if (ruleId && !previousRule) throw new Error("Recurring rule not found.");

  if (ruleId) {
    const { data: rule, error } = await context.supabase
      .from("recurring_task_rules")
      .update(ruleValues)
      .eq("id", ruleId)
      .eq("agency_id", context.agency.id)
      .eq("client_id", parsed.clientId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rule) throw new Error("Recurring rule not found.");
  } else {
    const { data: rule, error } = await context.supabase
      .from("recurring_task_rules")
      .insert({
        agency_id: context.agency.id,
        client_id: parsed.clientId,
        created_by: context.user.id,
        ...ruleValues,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    ruleId = rule.id;
  }

  try {
    await moveTaskTreeToList(context, parsed.taskId, recurringListId);
    const { data: updatedTask, error: updateError } = await context.supabase
      .from("tasks")
      .update({
        source_recurring_rule_id: ruleId,
        occurrence_date: occurrence.occurrenceDate,
        start_date: occurrence.occurrenceDate,
        due_date: occurrence.dueDate,
      })
      .eq("id", parsed.taskId)
      .eq("client_id", parsed.clientId)
      .eq("agency_id", context.agency.id)
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updatedTask) throw new Error("Task not found.");
  } catch (error) {
    await context.supabase
      .from("tasks")
      .update({
        source_recurring_rule_id: task.source_recurring_rule_id,
        occurrence_date: task.occurrence_date,
        start_date: task.start_date,
        due_date: task.due_date,
      })
      .eq("id", parsed.taskId)
      .eq("agency_id", context.agency.id)
      .eq("client_id", parsed.clientId);
    if (task.task_list_id && task.task_list_id !== recurringListId) {
      await moveTaskTreeToList(context, parsed.taskId, task.task_list_id).catch(() => undefined);
    }
    if (task.source_recurring_rule_id && previousRule) {
      await context.supabase
        .from("recurring_task_rules")
        .update(previousRule)
        .eq("id", task.source_recurring_rule_id)
        .eq("agency_id", context.agency.id)
        .eq("client_id", parsed.clientId);
    }
    if (!task.source_recurring_rule_id && ruleId) {
      await context.supabase
        .from("recurring_task_rules")
        .delete()
        .eq("id", ruleId)
        .eq("agency_id", context.agency.id);
    }
    throw error;
  }

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId: parsed.clientId,
    action: task.source_recurring_rule_id ? "recurring_rule.updated" : "task.made_recurring",
    entityType: "recurring_task_rule",
    entityId: ruleId,
    metadata: {
      task_id: parsed.taskId,
      frequency: parsed.frequency,
      interval_count: parsed.intervalCount,
      skip_weekends: parsed.skipWeekends,
      next_run_at: nextRunAt,
    },
  });
  revalidatePath(`/clients/${parsed.clientId}`);
  revalidatePath("/my-work");
  revalidatePath("/team");

  return {
    ruleId,
    recurringListId,
    startDate: occurrence.occurrenceDate,
    dueDate: occurrence.dueDate,
  };
}

export async function stopTaskRecurrence(input: unknown) {
  const parsed = z.object({
    clientId: z.string().uuid(),
    taskId: z.string().uuid(),
  }).parse(input);
  const context = await requireClient(parsed.clientId);
  const { data: task, error: taskError } = await context.supabase
    .from("tasks")
    .select("id, source_recurring_rule_id")
    .eq("id", parsed.taskId)
    .eq("client_id", parsed.clientId)
    .eq("agency_id", context.agency.id)
    .is("archived_at", null)
    .maybeSingle();
  if (taskError) throw new Error(taskError.message);
  if (!task) throw new Error("Task not found.");
  if (!task.source_recurring_rule_id) return;

  const { error: ruleError } = await context.supabase
    .from("recurring_task_rules")
    .update({ active: false })
    .eq("id", task.source_recurring_rule_id)
    .eq("agency_id", context.agency.id)
    .eq("client_id", parsed.clientId);
  if (ruleError) throw new Error(ruleError.message);
  const { error: taskUpdateError } = await context.supabase
    .from("tasks")
    .update({ source_recurring_rule_id: null, occurrence_date: null })
    .eq("id", parsed.taskId)
    .eq("agency_id", context.agency.id)
    .eq("client_id", parsed.clientId);
  if (taskUpdateError) throw new Error(taskUpdateError.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId: parsed.clientId,
    action: "task.recurrence_stopped",
    entityType: "task",
    entityId: parsed.taskId,
  });
  revalidatePath(`/clients/${parsed.clientId}`);
  revalidatePath("/my-work");
  revalidatePath("/team");
}

const bulkTaskActionSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(["status", "priority", "assignee", "archive"]),
  value: z.string().nullable().optional(),
});

export async function bulkUpdateTasks(input: unknown) {
  const parsed = bulkTaskActionSchema.parse(input);
  const taskIds = [...new Set(parsed.taskIds)];
  const context = await requireAgency();
  const { data: tasks, error: tasksError } = await context.supabase
    .from("tasks")
    .select("id, client_id, title, archived_at")
    .eq("agency_id", context.agency.id)
    .in("id", taskIds);
  if (tasksError) throw new Error(tasksError.message);
  if (tasks?.length !== taskIds.length) throw new Error("One or more selected tasks are unavailable.");
  if (tasks.some((task) => task.archived_at)) throw new Error("Archived tasks cannot be changed in bulk.");

  let value: string | null = parsed.value ?? null;
  let affectedTaskCount = taskIds.length;
  if (parsed.action === "status") value = z.enum(TASK_STATUSES).parse(parsed.value);
  if (parsed.action === "priority") value = z.enum(TASK_PRIORITIES).parse(parsed.value);
  if (parsed.action === "assignee" && value) {
    value = z.string().uuid().parse(value);
    const { data: member, error: memberError } = await context.supabase
      .from("agency_members")
      .select("user_id")
      .eq("agency_id", context.agency.id)
      .eq("user_id", value)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) throw new Error("Invalid assignee.");
  }

  if (parsed.action === "archive") {
    const archivedAt = new Date().toISOString();
    const archivedTaskIds = new Set<string>();
    for (const task of tasks) {
      const { data, error } = await context.supabase.rpc("archive_task_tree", {
        target_agency_id: context.agency.id,
        target_client_id: task.client_id,
        target_task_id: task.id,
        target_archived_at: archivedAt,
      });
      if (error) throw new Error(error.message);
      for (const archivedTask of (data ?? []) as Array<{ id: string }>) archivedTaskIds.add(archivedTask.id);
    }
    if (!taskIds.every((taskId) => archivedTaskIds.has(taskId))) {
      throw new Error("One or more selected tasks could not be archived.");
    }
    affectedTaskCount = archivedTaskIds.size;
  } else {
    const field = parsed.action === "assignee" ? "assignee_id" : parsed.action;
    const { data: updatedTasks, error } = await context.supabase
      .from("tasks")
      .update({ [field]: value })
      .eq("agency_id", context.agency.id)
      .is("archived_at", null)
      .in("id", taskIds)
      .select("id");
    if (error) throw new Error(error.message);
    if (updatedTasks?.length !== taskIds.length) throw new Error("One or more selected tasks could not be updated.");
  }

  const taskIdsByClient = new Map<string, string[]>();
  for (const task of tasks) {
    taskIdsByClient.set(task.client_id, [...(taskIdsByClient.get(task.client_id) ?? []), task.id]);
  }
  await Promise.all([...taskIdsByClient].map(([clientId, clientTaskIds]) => logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: `tasks.bulk_${parsed.action}`,
    entityType: "task_batch",
    metadata: {
      task_count: clientTaskIds.length,
      task_ids: clientTaskIds,
      value,
      affected_task_count: affectedTaskCount,
    },
  })));

  for (const clientId of taskIdsByClient.keys()) revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
  return { selectedTaskCount: taskIds.length, affectedTaskCount };
}

export async function createSubtask(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const parentTaskId = z.string().uuid().parse(formData.get("parent_task_id"));
  const context = await requireClient(clientId);
  const { data: parent } = await context.supabase
    .from("tasks")
    .select("id, task_list_id, title")
    .eq("id", parentTaskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .is("archived_at", null)
    .neq("status", "complete")
    .maybeSingle();
  if (!parent) throw new Error("Parent task must be open and active.");

  const assigneeId = optional(formData, "assignee_id");
  if (assigneeId) {
    const { data: member } = await context.supabase
      .from("agency_members")
      .select("user_id")
      .eq("agency_id", context.agency.id)
      .eq("user_id", assigneeId)
      .maybeSingle();
    if (!member) throw new Error("Invalid assignee.");
  }
  const rawStartDate = optional(formData, "start_date");
  const rawDueDate = optional(formData, "due_date");
  const startDate = rawStartDate ? z.string().date().parse(rawStartDate) : null;
  const dueDate = rawDueDate ? z.string().date().parse(rawDueDate) : null;
  if (startDate && dueDate && dueDate < startDate) {
    throw new Error("Due date cannot be before start date.");
  }
  const title = z.string().trim().min(1).max(500).parse(formData.get("title"));
  const { data: subtask, error } = await context.supabase
    .from("tasks")
    .insert({
      agency_id: context.agency.id,
      client_id: clientId,
      task_list_id: parent.task_list_id,
      parent_task_id: parentTaskId,
      title,
      status: "todo",
      priority: "normal",
      assignee_id: assigneeId,
      start_date: startDate,
      due_date: dueDate,
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await ensureTaskWatchers({
    agencyId: context.agency.id,
    taskId: subtask.id,
    userIds: [context.user.id],
  });
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "subtask.created",
    entityType: "task",
    entityId: subtask.id,
    metadata: {
      title,
      parent_task_id: parentTaskId,
      parent_title: parent.title,
      start_date: startDate,
      due_date: dueDate,
    },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
}

export async function archiveTask(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const taskId = z.string().uuid().parse(formData.get("task_id"));
  const context = await requireClient(clientId);
  const { data: rootTask, error: rootTaskError } = await context.supabase
    .from("tasks")
    .select("id, title, archived_at")
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (rootTaskError) throw new Error(rootTaskError.message);
  if (!rootTask) throw new Error("Task not found.");
  if (rootTask.archived_at) throw new Error("Task is already archived.");

  const { data, error } = await context.supabase.rpc("archive_task_tree", {
    target_agency_id: context.agency.id,
    target_client_id: clientId,
    target_task_id: taskId,
    target_archived_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  const archivedTasks = (data ?? []) as Array<{ id: string; title: string }>;
  if (!archivedTasks.some((task) => task.id === taskId)) throw new Error("Task could not be archived.");
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task.archived",
    entityType: "task",
    entityId: taskId,
    metadata: {
      title: rootTask.title,
      archived_subtask_count: Math.max(0, archivedTasks.length - 1),
    },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
}

export async function restoreTask(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const taskId = z.string().uuid().parse(formData.get("task_id"));
  const context = await requireClient(clientId);
  const { data: rootTask, error: rootTaskError } = await context.supabase
    .from("tasks")
    .select("id, title, archived_at")
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (rootTaskError) throw new Error(rootTaskError.message);
  if (!rootTask?.archived_at) throw new Error("Archived task not found or already restored.");

  const { data, error } = await context.supabase.rpc("restore_task_tree", {
    target_agency_id: context.agency.id,
    target_client_id: clientId,
    target_task_id: taskId,
  });
  if (error) throw new Error(error.message);
  const restoredTasks = (data ?? []) as Array<{ id: string; title: string }>;
  if (!restoredTasks.some((task) => task.id === taskId)) throw new Error("Task could not be restored.");
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task.restored",
    entityType: "task",
    entityId: taskId,
    metadata: {
      title: rootTask.title,
      restored_subtask_count: Math.max(0, restoredTasks.length - 1),
    },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
}

export async function deleteTask(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const taskId = String(formData.get("task_id"));
  const context = await requireClient(clientId);
  const { count: subtaskCount } = await context.supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("parent_task_id", taskId)
    .eq("agency_id", context.agency.id);
  if (subtaskCount) throw new Error("Delete or move this task's subtasks first.");

  const { data: task } = await context.supabase
    .from("tasks")
    .select("id, task_comments(task_comment_attachments(storage_path))")
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (!task) throw new Error("Task not found.");

  const comments = task.task_comments as unknown as Array<{
    task_comment_attachments: Array<{ storage_path: string }>;
  }>;
  const paths = comments.flatMap((comment) =>
    (comment.task_comment_attachments ?? []).map((attachment) => attachment.storage_path),
  );
  if (paths.length) await createAdminClient().storage.from("comment-attachments").remove(paths);

  const { error } = await context.supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task.deleted",
    entityType: "task",
    entityId: taskId,
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
}

export async function addTaskComment(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const taskId = String(formData.get("task_id"));
  const context = await requireClient(clientId);
  const body = String(formData.get("body") ?? "").trim();
  const clientRequestId = z.string().uuid().parse(formData.get("client_request_id"));
  const attachments = z.array(attachmentSchema).max(10).parse(
    JSON.parse(String(formData.get("attachments") ?? "[]")),
  );
  if (!body && !attachments.length) throw new Error("Add a comment or attachment.");
  const pathPrefix = `${context.agency.id}/${taskId}/`;
  if (attachments.some((attachment) => !attachment.storage_path.startsWith(pathPrefix))) {
    throw new Error("Invalid attachment path.");
  }
  const { data: task } = await context.supabase
    .from("tasks")
    .select("id, title")
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (!task) throw new Error("Task not found.");

  const commentValues = {
    agency_id: context.agency.id,
    task_id: taskId,
    author_id: context.user.id,
    body,
    client_request_id: clientRequestId,
  };
  let commentResult = await context.supabase
    .from("task_comments")
    .insert(commentValues)
    .select("id")
    .single();
  if (isMissingCommentRequestIdColumn(commentResult.error)) {
    // Keeps comments usable until migration 0006 is applied.
    const { client_request_id: _, ...legacyCommentValues } = commentValues;
    void _;
    commentResult = await context.supabase
      .from("task_comments")
      .insert(legacyCommentValues)
      .select("id")
      .single();
  }
  const { data: comment, error } = commentResult;
  if (error?.code === "23505" && error.message.includes("task_comments_agency_request_key")) return;
  if (error) throw new Error(error.message);
  if (attachments.length) {
    const { error: attachmentError } = await context.supabase
      .from("task_comment_attachments")
      .insert(attachments.map((attachment) => ({
        ...attachment,
        agency_id: context.agency.id,
        comment_id: comment.id,
      })));
    if (attachmentError) {
      await context.supabase.from("task_comments").delete().eq("id", comment.id);
      throw new Error(attachmentError.message);
    }
  }
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task.commented",
    entityType: "task",
    entityId: taskId,
  });
  const { data: members, error: membersError } = await context.supabase
    .from("agency_members")
    .select("user_id, display_name, email")
    .eq("agency_id", context.agency.id);
  if (membersError) throw new Error(membersError.message);
  const mentionedMemberIds = findMentionedMemberIds(body, members ?? []);
  await ensureTaskWatchers({
    agencyId: context.agency.id,
    taskId,
    userIds: [context.user.id, ...mentionedMemberIds],
  });
  await notifyTaskAudience({
    supabase: context.supabase,
    agencyId: context.agency.id,
    actorId: context.user.id,
    actorName: context.membership.display_name || context.membership.email || context.user.email || "A teammate",
    clientId,
    taskId,
    taskTitle: task.title,
    kind: "comment_added",
    body: body || (attachments.length ? "Added an attachment." : null),
    commentId: comment.id,
    mentionedMemberIds,
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
  revalidatePath("/inbox");
}

export async function saveDossier(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const context = await requireClient(clientId);
  const sections = Object.fromEntries(
    DOSSIER_SECTIONS.map((section) => {
      const value = String(formData.get(section) ?? "").trim();
      if (!value) return [section, {}];
      try {
        return [section, JSON.parse(value)];
      } catch {
        return [section, { notes: value }];
      }
    }),
  );

  const { error } = await context.supabase.from("dossiers").upsert(
    {
      agency_id: context.agency.id,
      client_id: clientId,
      ...sections,
      knowledge_base: optional(formData, "knowledge_base"),
      ai_summary: optional(formData, "ai_summary"),
    },
    { onConflict: "client_id" },
  );
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "dossier.updated",
    entityType: "dossier",
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function createRecurringRule(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const context = await requireClient(clientId);
  const taskListId = optional(formData, "task_list_id") ?? await defaultTaskListId(context, "recurring");
  await validateTaskRelations(context, taskListId, null);
  const firstStart = z.string().date().parse(formData.get("first_start_date"));
  const firstDue = z.string().date().parse(formData.get("first_due_date"));
  const dueOffsetDays = Math.round(
    (new Date(`${firstDue}T12:00:00Z`).getTime() - new Date(`${firstStart}T12:00:00Z`).getTime()) / 86400000,
  );
  if (dueOffsetDays < 0) throw new Error("First due date cannot be before the first start date.");
  if (dueOffsetDays > 3650) throw new Error("Recurring task due date must be within 10 years of its start date.");
  const skipWeekends = formData.get("skip_weekends") === "on";
  const assigneeId = optional(formData, "assignee_id");
  const frequency = z.enum(["daily", "weekly", "monthly"]).parse(formData.get("frequency"));
  const intervalCount = z.coerce.number().int().positive().parse(formData.get("interval_count"));
  const title = z.string().trim().min(1).parse(formData.get("title"));
  const description = optional(formData, "description");
  const priority = z.enum(TASK_PRIORITIES).parse(formData.get("priority") || "normal");
  if (assigneeId) {
    const { data: member } = await context.supabase
      .from("agency_members")
      .select("user_id")
      .eq("agency_id", context.agency.id)
      .eq("user_id", assigneeId)
      .maybeSingle();
    if (!member) throw new Error("Invalid assignee.");
  }
  const nextRunAt = skipWeekends ? moveToWeekday(firstStart) : firstStart;
  const { data: rule, error } = await context.supabase
    .from("recurring_task_rules")
    .insert({
      agency_id: context.agency.id,
      client_id: clientId,
      task_list_id: taskListId,
      title,
      description,
      priority,
      assignee_id: assigneeId,
      frequency,
      interval_count: intervalCount,
      next_run_at: nextRunAt,
      due_offset_days: dueOffsetDays,
      skip_weekends: skipWeekends,
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (context.client.status === "active" && nextRunAt <= dateInputValue()) {
    const { occurrenceDate, dueDate } = recurringOccurrence(nextRunAt, dueOffsetDays, skipWeekends);
    const { data: task, error: taskError } = await context.supabase
      .from("tasks")
      .insert({
        agency_id: context.agency.id,
        client_id: clientId,
        task_list_id: taskListId,
        source_recurring_rule_id: rule.id,
        occurrence_date: occurrenceDate,
        title,
        description,
        status: "todo",
        priority,
        assignee_id: assigneeId,
        start_date: occurrenceDate,
        due_date: dueDate,
        created_by: context.user.id,
      })
      .select("id")
      .single();
    if (taskError) {
      await context.supabase.from("recurring_task_rules").delete().eq("id", rule.id).eq("agency_id", context.agency.id);
      throw new Error(taskError.message);
    }
    await ensureTaskWatchers({
      agencyId: context.agency.id,
      taskId: task.id,
      userIds: [context.user.id],
    });
    const followingRun = advanceRecurringDate(occurrenceDate, frequency, intervalCount, skipWeekends);
    const { error: advanceError } = await context.supabase
      .from("recurring_task_rules")
      .update({ next_run_at: followingRun })
      .eq("id", rule.id)
      .eq("agency_id", context.agency.id);
    if (advanceError) throw new Error(advanceError.message);
    revalidatePath("/my-work");
  }
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "recurring_rule.created",
    entityType: "recurring_task_rule",
    entityId: rule.id,
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function generateOnboardingLink(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const context = await requireClient(clientId);
  const { data, error } = await context.supabase
    .from("onboarding_links")
    .insert({
      agency_id: context.agency.id,
      client_id: clientId,
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "onboarding_link.created",
    entityType: "onboarding_link",
    entityId: data.id,
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function setOnboardingLinkActive(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const linkId = z.string().uuid().parse(formData.get("link_id"));
  const active = z.enum(["true", "false"]).parse(formData.get("active")) === "true";
  const context = await requireClient(clientId);
  const { data: link, error: linkError } = await context.supabase
    .from("onboarding_links")
    .select("id, active, expires_at")
    .eq("id", linkId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (linkError) throw new Error(linkError.message);
  if (!link) throw new Error("Onboarding form not found.");
  if (active && link.expires_at && new Date(link.expires_at) < new Date()) {
    throw new Error("Expired onboarding forms cannot be unarchived.");
  }

  const { error } = await context.supabase
    .from("onboarding_links")
    .update({ active })
    .eq("id", linkId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: active ? "onboarding_link.unarchived" : "onboarding_link.archived",
    entityType: "onboarding_link",
    entityId: linkId,
  });
  revalidatePath(`/clients/${clientId}`);
}

function mergeDossierSection(existing: unknown, incoming: unknown) {
  const existingObject = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  const incomingObject = incoming && typeof incoming === "object" && !Array.isArray(incoming)
    ? incoming as Record<string, unknown>
    : {};
  const meaningfulIncoming = Object.fromEntries(
    Object.entries(incomingObject).filter(([, value]) => (
      Array.isArray(value) ? value.length > 0 : value !== "" && value !== null && value !== undefined
    )),
  );
  return { ...existingObject, ...meaningfulIncoming };
}

export async function copyOnboardingToDossier(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const submissionId = String(formData.get("submission_id"));
  const context = await requireClient(clientId);
  const { data: submission } = await context.supabase
    .from("onboarding_submissions")
    .select("submission")
    .eq("id", submissionId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (!submission) throw new Error("Submission not found.");

  const { data: existingDossier, error: dossierError } = await context.supabase
    .from("dossiers")
    .select("*")
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .maybeSingle();
  if (dossierError) throw new Error(dossierError.message);

  const source = submission.submission as Record<string, unknown>;
  const sectionValues = Object.fromEntries(
    DOSSIER_SECTIONS.map((section) => [
      section,
      mergeDossierSection(existingDossier?.[section], source[section]),
    ]),
  );
  const incomingKnowledgeBase = typeof source.knowledge_base === "string" ? source.knowledge_base.trim() : "";
  const { error } = await context.supabase.from("dossiers").upsert(
    {
      agency_id: context.agency.id,
      client_id: clientId,
      ...sectionValues,
      knowledge_base: incomingKnowledgeBase || existingDossier?.knowledge_base || null,
      ai_summary: existingDossier?.ai_summary || null,
    },
    { onConflict: "client_id" },
  );
  if (error) throw new Error(error.message);

  await context.supabase
    .from("onboarding_submissions")
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: context.user.id })
    .eq("id", submissionId)
    .eq("agency_id", context.agency.id);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "onboarding_submission.merged_into_dossier",
    entityType: "onboarding_submission",
    entityId: submissionId,
  });
  revalidatePath(`/clients/${clientId}`);
}
