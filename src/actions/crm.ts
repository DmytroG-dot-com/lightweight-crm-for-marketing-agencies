"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAgency, requireClient } from "@/lib/auth";
import { DOSSIER_SECTIONS, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";

const clientSchema = z.object({
  name: z.string().trim().min(1),
  company_name: z.string().trim().optional(),
  contact_name: z.string().trim().optional(),
  contact_email: z.string().trim().optional(),
  website: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  status: z.enum(["active", "paused", "archived"]).default("active"),
});

const optional = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim() || null;

const attachmentSchema = z.object({
  storage_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
  content_type: z.string().max(255).nullable(),
  size_bytes: z.number().int().nonnegative().max(104857600),
});

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
  redirect(`/clients/${client.id}?tab=tasks&list=general`);
}

export async function updateClient(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const context = await requireClient(clientId);
  const parsed = clientSchema.parse(Object.fromEntries(formData));
  const { error } = await context.supabase
    .from("clients")
    .update(parsed)
    .eq("id", clientId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "client.updated",
    entityType: "client",
    entityId: clientId,
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function createTaskList(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const context = await requireClient(clientId);
  const name = z.string().trim().min(1).parse(formData.get("name"));
  const { error } = await context.supabase.from("task_lists").insert({
    agency_id: context.agency.id,
    client_id: clientId,
    name,
    kind: "custom",
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);
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
      .maybeSingle();
    if (!data) throw new Error("Invalid parent task.");
  }
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
  await validateTaskRelations(context, taskListId, parentTaskId);

  const { error } = await context.supabase
    .from("tasks")
    .update({
      title: z.string().trim().min(1).parse(formData.get("title")),
      description: optional(formData, "description"),
      status: z.enum(TASK_STATUSES).parse(formData.get("status")),
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
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
}

export async function updateTaskStatus(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const taskId = String(formData.get("task_id"));
  const status = z.enum(TASK_STATUSES).parse(formData.get("status"));
  const context = await requireClient(clientId);
  const { error } = await context.supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task.status_changed",
    entityType: "task",
    entityId: taskId,
    metadata: { status },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
}

export async function updateTaskDueDate(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const taskId = String(formData.get("task_id"));
  const dueDate = optional(formData, "due_date");
  if (dueDate) z.string().date().parse(dueDate);
  const context = await requireClient(clientId);
  const { error } = await context.supabase
    .from("tasks")
    .update({ due_date: dueDate })
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");
}

export async function archiveTask(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const taskId = String(formData.get("task_id"));
  const context = await requireClient(clientId);
  const { error } = await context.supabase
    .from("tasks")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task.archived",
    entityType: "task",
    entityId: taskId,
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
    .select("id")
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (!task) throw new Error("Task not found.");

  const { data: comment, error } = await context.supabase
    .from("task_comments")
    .insert({
      agency_id: context.agency.id,
      task_id: taskId,
      author_id: context.user.id,
      body,
    })
    .select("id")
    .single();
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
  revalidatePath(`/clients/${clientId}`);
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
  const { data: rule, error } = await context.supabase
    .from("recurring_task_rules")
    .insert({
      agency_id: context.agency.id,
      client_id: clientId,
      task_list_id: taskListId,
      title: z.string().trim().min(1).parse(formData.get("title")),
      description: optional(formData, "description"),
      priority: z.enum(TASK_PRIORITIES).parse(formData.get("priority") || "normal"),
      assignee_id: optional(formData, "assignee_id"),
      frequency: z.enum(["daily", "weekly", "monthly"]).parse(formData.get("frequency")),
      interval_count: z.coerce.number().int().positive().parse(formData.get("interval_count")),
      next_run_at: z.string().date().parse(formData.get("next_run_at")),
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
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

  const source = submission.submission as Record<string, unknown>;
  const sectionValues = Object.fromEntries(
    DOSSIER_SECTIONS.map((section) => [section, source[section] ?? {}]),
  );
  const { error } = await context.supabase.from("dossiers").upsert(
    {
      agency_id: context.agency.id,
      client_id: clientId,
      ...sectionValues,
      knowledge_base: typeof source.knowledge_base === "string" ? source.knowledge_base : null,
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
    action: "onboarding_submission.copied_to_dossier",
    entityType: "onboarding_submission",
    entityId: submissionId,
  });
  revalidatePath(`/clients/${clientId}`);
}
