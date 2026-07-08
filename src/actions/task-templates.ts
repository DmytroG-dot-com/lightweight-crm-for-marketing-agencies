"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAgency, requireClient } from "@/lib/auth";

type TemplateActionResult =
  | { ok: true; message: string; templateId?: string; taskCount?: number }
  | { ok: false; error: string };

type SourceTask = {
  id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  created_at: string;
};

type TemplateItem = {
  id: string;
  parent_item_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  sort_order: number;
  created_at: string;
};

function byCreatedAt(a: { created_at: string }, b: { created_at: string }) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function buildTaskTreeRows(rootTaskId: string, tasks: SourceTask[]) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const rootTask = taskById.get(rootTaskId);
  if (!rootTask) return null;

  return buildTaskRowsFromRoots([rootTask], tasks);
}

function buildTaskListRows(tasks: SourceTask[]) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const rootTasks = tasks
    .filter((task) => !task.parent_task_id || !taskById.has(task.parent_task_id))
    .sort(byCreatedAt);

  return buildTaskRowsFromRoots(rootTasks, tasks);
}

function buildTaskRowsFromRoots(rootTasks: SourceTask[], tasks: SourceTask[]) {
  const childrenByParent = new Map<string | null, SourceTask[]>();
  tasks.forEach((task) => {
    const key = task.parent_task_id ?? null;
    const siblings = childrenByParent.get(key) ?? [];
    siblings.push(task);
    childrenByParent.set(key, siblings);
  });
  childrenByParent.forEach((siblings) => siblings.sort(byCreatedAt));

  const rows: Array<{
    originalTaskId: string;
    parentOriginalTaskId: string | null;
    sortOrder: number;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    assignee_id: string | null;
  }> = [];

  function visit(task: SourceTask, parentOriginalTaskId: string | null, sortOrder: number) {
    rows.push({
      originalTaskId: task.id,
      parentOriginalTaskId,
      sortOrder,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignee_id: task.assignee_id,
    });

    const children = childrenByParent.get(task.id) ?? [];
    children.forEach((child, index) => {
      visit(child, task.id, index);
    });
  }

  rootTasks.forEach((rootTask, index) => {
    visit(rootTask, null, index);
  });
  return rows;
}

function buildTemplateItemTree(items: TemplateItem[]) {
  const childrenByParent = new Map<string | null, TemplateItem[]>();
  items.forEach((item) => {
    const key = item.parent_item_id ?? null;
    const siblings = childrenByParent.get(key) ?? [];
    siblings.push(item);
    childrenByParent.set(key, siblings);
  });
  childrenByParent.forEach((siblings) =>
    siblings.sort((a, b) => a.sort_order - b.sort_order || byCreatedAt(a, b)),
  );

  const roots = childrenByParent.get(null) ?? [];
  return { childrenByParent, roots };
}

async function saveTemplateRows({
  context,
  clientId,
  name,
  description,
  rows,
  createdFromTaskId = null,
  createdFromTaskListId = null,
  logAction,
  logMetadata,
}: {
  context: Awaited<ReturnType<typeof requireClient>>;
  clientId: string;
  name: string;
  description: string | null;
  rows: ReturnType<typeof buildTaskRowsFromRoots>;
  createdFromTaskId?: string | null;
  createdFromTaskListId?: string | null;
  logAction: string;
  logMetadata: Record<string, string | number | null>;
}): Promise<TemplateActionResult> {
  if (!rows.length) {
    return { ok: false, error: "This template has no tasks." };
  }

  const { data: template, error: templateError } = await context.supabase
    .from("task_templates")
    .insert({
      agency_id: context.agency.id,
      name,
      description,
      created_from_task_id: createdFromTaskId,
      created_from_task_list_id: createdFromTaskListId,
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (templateError) throw new Error(templateError.message);

  const itemIdByOriginalTaskId = new Map<string, string>();
  const itemRows = rows.map((row) => {
    const itemId = randomUUID();
    itemIdByOriginalTaskId.set(row.originalTaskId, itemId);
    return {
      id: itemId,
      agency_id: context.agency.id,
      template_id: template.id,
      parent_item_id: row.parentOriginalTaskId ? itemIdByOriginalTaskId.get(row.parentOriginalTaskId) ?? null : null,
      sort_order: row.sortOrder,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      assignee_id: row.assignee_id,
    };
  });

  const { error: itemsError } = await context.supabase
    .from("task_template_items")
    .insert(itemRows);
  if (itemsError) {
    await context.supabase.from("task_templates").delete().eq("id", template.id).eq("agency_id", context.agency.id);
    throw new Error(itemsError.message);
  }

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: logAction,
    entityType: "task_template",
    entityId: template.id,
    metadata: {
      name,
      task_count: itemRows.length,
      ...logMetadata,
    },
  });
  revalidatePath("/settings");
  revalidatePath(`/clients/${clientId}`);

  return {
    ok: true,
    message: `Saved "${name}" with ${itemRows.length} task${itemRows.length === 1 ? "" : "s"}.`,
    templateId: template.id,
    taskCount: itemRows.length,
  };
}

export async function saveTaskTreeAsTemplate(formData: FormData): Promise<TemplateActionResult> {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const rootTaskId = z.string().uuid().parse(formData.get("task_id"));
  const name = z.string().trim().min(1).max(180).parse(formData.get("name"));
  const description = String(formData.get("description") ?? "").trim() || null;

  const context = await requireClient(clientId);
  const { data: tasks, error: tasksError } = await context.supabase
    .from("tasks")
    .select("id, parent_task_id, title, description, status, priority, assignee_id, created_at")
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .is("archived_at", null);
  if (tasksError) throw new Error(tasksError.message);

  const taskRows = buildTaskTreeRows(rootTaskId, (tasks ?? []) as SourceTask[]);
  if (!taskRows) return { ok: false, error: "Task tree not found." };

  return saveTemplateRows({
    context,
    clientId,
    name,
    description,
    rows: taskRows,
    createdFromTaskId: rootTaskId,
    logAction: "task_template.created",
    logMetadata: {
      source_task_id: rootTaskId,
      source_task_list_id: null,
    },
  });
}

export async function saveTaskListAsTemplate(formData: FormData): Promise<TemplateActionResult> {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const taskListId = z.string().uuid().parse(formData.get("task_list_id"));
  const name = z.string().trim().min(1).max(180).parse(formData.get("name"));
  const description = String(formData.get("description") ?? "").trim() || null;

  const context = await requireClient(clientId);
  const { data: list, error: listError } = await context.supabase
    .from("task_lists")
    .select("id, name, kind")
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .eq("id", taskListId)
    .is("archived_at", null)
    .maybeSingle();
  if (listError) throw new Error(listError.message);
  if (!list) return { ok: false, error: "Task list not found." };
  if (list.kind !== "custom") {
    return { ok: false, error: "Only custom task lists can be saved as task templates." };
  }

  const { data: tasks, error: tasksError } = await context.supabase
    .from("tasks")
    .select("id, parent_task_id, title, description, status, priority, assignee_id, created_at")
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .eq("task_list_id", taskListId)
    .is("archived_at", null);
  if (tasksError) throw new Error(tasksError.message);

  const taskRows = buildTaskListRows((tasks ?? []) as SourceTask[]);
  if (!taskRows.length) {
    return { ok: false, error: "This task list has no active tasks to save." };
  }

  return saveTemplateRows({
    context,
    clientId,
    name,
    description,
    rows: taskRows,
    createdFromTaskListId: taskListId,
    logAction: "task_list_template.created",
    logMetadata: {
      source_task_id: null,
      source_task_list_id: taskListId,
    },
  });
}

export async function applyTaskTemplate(formData: FormData): Promise<TemplateActionResult> {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const templateId = z.string().uuid().parse(formData.get("template_id"));
  const context = await requireClient(clientId);
  const taskListId = String(formData.get("task_list_id") ?? "").trim() || null;

  const { data: selectedList, error: listError } = taskListId
    ? await context.supabase
      .from("task_lists")
      .select("id, kind")
      .eq("id", taskListId)
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
      .is("archived_at", null)
      .maybeSingle()
    : await context.supabase
      .from("task_lists")
      .select("id, kind")
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
      .eq("kind", "general")
      .is("archived_at", null)
      .maybeSingle();
  if (listError) throw new Error(listError.message);
  if (!selectedList) return { ok: false, error: "Destination list not found." };
  if (selectedList.kind === "recurring") {
    return { ok: false, error: "Templates cannot be applied to the Recurring list." };
  }

  const [
    { data: template, error: templateError },
    { data: items, error: itemsError },
    { data: members, error: membersError },
  ] = await Promise.all([
    context.supabase
      .from("task_templates")
      .select("id, name")
      .eq("id", templateId)
      .eq("agency_id", context.agency.id)
      .maybeSingle(),
    context.supabase
      .from("task_template_items")
      .select("id, parent_item_id, title, description, status, priority, assignee_id, sort_order, created_at")
      .eq("template_id", templateId)
      .eq("agency_id", context.agency.id),
    context.supabase
      .from("agency_members")
      .select("user_id")
      .eq("agency_id", context.agency.id),
  ]);
  if (templateError || itemsError || membersError) {
    throw new Error(templateError?.message || itemsError?.message || membersError?.message);
  }
  if (!template) return { ok: false, error: "Template not found." };

  const templateItems = (items ?? []) as TemplateItem[];
  if (!templateItems.length) return { ok: false, error: "This template has no tasks." };

  const validAssigneeIds = new Set((members ?? []).map((member) => member.user_id));
  const { childrenByParent, roots } = buildTemplateItemTree(templateItems);
  const createdTaskIds: string[] = [];
  const queue = roots.map((item) => ({ item, parentTaskId: null as string | null }));
  let createdCount = 0;

  try {
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;

      const { data: task, error } = await context.supabase
        .from("tasks")
        .insert({
          agency_id: context.agency.id,
          client_id: clientId,
          task_list_id: selectedList.id,
          parent_task_id: current.parentTaskId,
          title: current.item.title,
          description: current.item.description,
          status: current.item.status === "complete" ? "todo" : current.item.status,
          priority: current.item.priority,
          assignee_id: current.item.assignee_id && validAssigneeIds.has(current.item.assignee_id)
            ? current.item.assignee_id
            : null,
          created_by: context.user.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      createdTaskIds.push(task.id);
      createdCount += 1;

      const children = childrenByParent.get(current.item.id) ?? [];
      children.forEach((child) => {
        queue.push({ item: child, parentTaskId: task.id });
      });
    }
  } catch (error) {
    if (createdTaskIds.length > 0) {
      await context.supabase
        .from("tasks")
        .delete()
        .eq("agency_id", context.agency.id)
        .eq("client_id", clientId)
        .in("id", createdTaskIds);
    }
    throw error instanceof Error ? error : new Error("Could not apply task template.");
  }

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "task_template.applied",
    entityType: "task_template",
    entityId: template.id,
    metadata: {
      name: template.name,
      task_count: createdCount,
      task_list_id: selectedList.id,
    },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/my-work");

  return {
    ok: true,
    message: `Applied "${template.name}" and created ${createdCount} task${createdCount === 1 ? "" : "s"}.`,
    taskCount: createdCount,
  };
}

export async function deleteTaskTemplate(formData: FormData) {
  const templateId = z.string().uuid().parse(formData.get("template_id"));
  const context = await requireAgency();

  const { data: template, error: templateError } = await context.supabase
    .from("task_templates")
    .select("id, name")
    .eq("id", templateId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (templateError) throw new Error(templateError.message);
  if (!template) throw new Error("Task template not found.");

  const { error } = await context.supabase
    .from("task_templates")
    .delete()
    .eq("id", templateId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "task_template.deleted",
    entityType: "task_template",
    entityId: templateId,
    metadata: { name: template.name },
  });
  revalidatePath("/settings");
}
