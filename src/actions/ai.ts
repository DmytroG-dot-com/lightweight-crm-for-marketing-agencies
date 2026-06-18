"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { encryptSecret } from "@/lib/ai/crypto";
import { DEFAULT_OPENAI_IMAGE_MODEL, DEFAULT_OPENAI_MODEL, getAgencyAiRuntimeSettings, isMissingAiSettingsColumn } from "@/lib/ai/settings";
import { parseTaskInstruction, type AiTaskDraft } from "@/lib/ai/task-parser";
import { requireAgency, requireClient } from "@/lib/auth";
import { ensureTaskWatchers } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTaskDescription } from "@/lib/task-description";
import { addDaysToDateValue, dateInputValue } from "@/lib/utils";

const quickTaskSchema = z.object({
  instruction: z.string().trim().min(1).max(10_000),
  current_client_id: z.string().uuid(),
  current_list_id: z.string().uuid(),
});

function requireAdmin(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new Error("Only agency owners and admins can configure AI.");
  }
}

function fallbackTitle(instruction: string) {
  const firstLine = instruction.split(/\r?\n/)[0].replace(/\s+/g, " ").trim();
  const words = firstLine.split(" ").filter(Boolean);
  return words.slice(0, 12).join(" ").slice(0, 200) || "New task";
}

function combinedDescription(generated: string, instruction: string) {
  const clean = generated.trim();
  return normalizeTaskDescription(`${clean ? `${clean}\n\n` : ""}## Original request\n${instruction}`);
}

export async function createTaskFromInstruction(input: unknown) {
  const parsed = quickTaskSchema.parse(input);
  const context = await requireClient(parsed.current_client_id);
  const today = dateInputValue(new Date(), context.membership.timezone);
  const tomorrow = addDaysToDateValue(today, 1);

  const [
    { data: members, error: membersError },
    { data: clients, error: clientsError },
    { data: lists, error: listsError },
    { data: tasks, error: tasksError },
    aiSettings,
  ] = await Promise.all([
    context.supabase
      .from("agency_members")
      .select("user_id, display_name, email")
      .eq("agency_id", context.agency.id),
    context.supabase
      .from("clients")
      .select("id, name")
      .eq("agency_id", context.agency.id)
      .neq("status", "archived"),
    context.supabase
      .from("task_lists")
      .select("id, client_id, name, kind")
      .eq("agency_id", context.agency.id)
      .is("archived_at", null),
    context.supabase
      .from("tasks")
      .select("id, client_id, title")
      .eq("agency_id", context.agency.id)
      .is("archived_at", null)
      .neq("status", "complete")
      .limit(250),
    getAgencyAiRuntimeSettings(context.agency.id),
  ]);
  const queryError = membersError || clientsError || listsError || tasksError;
  if (queryError) throw new Error(queryError.message);

  const agencyMembers = members ?? [];
  const agencyClients = clients ?? [];
  const agencyLists = lists ?? [];
  const agencyTasks = tasks ?? [];
  const currentList = agencyLists.find(
    (list) => list.id === parsed.current_list_id && list.client_id === context.client.id,
  );
  const currentGeneral = agencyLists.find(
    (list) => list.client_id === context.client.id && list.kind === "general",
  );
  const fallbackList = currentGeneral ?? currentList;
  if (!fallbackList) throw new Error("This client does not have an active General task list.");

  let usedAi = false;
  let warning: string | null = null;
  let draft: AiTaskDraft = {
    title: fallbackTitle(parsed.instruction),
    description: "",
    client_id: context.client.id,
    assignee_id: context.user.id,
    parent_task_id: null,
    status: "todo",
    priority: "normal",
    start_date: today,
    due_date: tomorrow,
  };

  if (aiSettings) {
    try {
      draft = await parseTaskInstruction({
        settings: aiSettings,
        context: {
          instruction: parsed.instruction,
          today,
          tomorrow,
          currentUserId: context.user.id,
          currentClientId: context.client.id,
          currentListId: currentList?.id ?? fallbackList.id,
          members: agencyMembers.map((member) => ({
            id: member.user_id,
            name: member.display_name || member.email || "Member",
          })),
          clients: agencyClients,
          lists: agencyLists,
          tasks: agencyTasks,
        },
      });
      usedAi = true;
    } catch (error) {
      warning = error instanceof Error
        ? `AI parsing failed, so default task settings were used: ${error.message}`
        : "AI parsing failed, so default task settings were used.";
    }
  }

  const targetClient = agencyClients.find((client) => client.id === draft.client_id) ?? context.client;
  const targetList = targetClient.id === context.client.id
    ? fallbackList
    : agencyLists.find((list) => list.client_id === targetClient.id && list.kind === "general");
  if (!targetList) throw new Error("The selected client does not have an active General task list.");

  const assigneeId = draft.assignee_id === null
    ? null
    : agencyMembers.some((member) => member.user_id === draft.assignee_id)
      ? draft.assignee_id
      : context.user.id;
  const parentTaskId = agencyTasks.some(
    (task) => task.id === draft.parent_task_id && task.client_id === targetClient.id,
  ) ? draft.parent_task_id : null;

  const { data: task, error } = await context.supabase
    .from("tasks")
    .insert({
      agency_id: context.agency.id,
      client_id: targetClient.id,
      task_list_id: targetList.id,
      parent_task_id: parentTaskId,
      title: draft.title,
      description: combinedDescription(draft.description, parsed.instruction),
      status: draft.status,
      priority: draft.priority,
      assignee_id: assigneeId,
      start_date: draft.start_date,
      due_date: draft.due_date,
      original_context: parsed.instruction,
      ai_generated: usedAi,
      ai_metadata: usedAi ? { provider: aiSettings?.provider, model: aiSettings?.model } : {},
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
    clientId: targetClient.id,
    action: usedAi ? "task.created_with_ai" : "task.quick_created",
    entityType: "task",
    entityId: task.id,
    metadata: { title: draft.title, provider: usedAi ? aiSettings?.provider : null },
  });
  revalidatePath(`/clients/${targetClient.id}`);
  revalidatePath("/my-work");

  return {
    taskId: task.id,
    taskTitle: draft.title,
    clientId: targetClient.id,
    clientName: targetClient.name,
    listId: targetList.id,
    listParam: targetList.kind === "general" || targetList.kind === "recurring" ? targetList.kind : targetList.id,
    usedAi,
    warning,
  };
}

export async function createPlainTaskFromInstruction(input: unknown) {
  const parsed = quickTaskSchema.parse(input);
  const context = await requireClient(parsed.current_client_id);
  const title = parsed.instruction.replace(/\s+/g, " ").trim().slice(0, 500);
  const startDate = dateInputValue(new Date(), context.membership.timezone);
  const dueDate = addDaysToDateValue(startDate, 1);
  const { data: list, error: listError } = await context.supabase
    .from("task_lists")
    .select("id, kind")
    .eq("id", parsed.current_list_id)
    .eq("client_id", context.client.id)
    .eq("agency_id", context.agency.id)
    .is("archived_at", null)
    .maybeSingle();
  if (listError) throw new Error(listError.message);
  if (!list) throw new Error("This task list is no longer available.");

  const { data: task, error } = await context.supabase
    .from("tasks")
    .insert({
      agency_id: context.agency.id,
      client_id: context.client.id,
      task_list_id: list.id,
      title,
      status: "todo",
      priority: "normal",
      assignee_id: context.user.id,
      start_date: startDate,
      due_date: dueDate,
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
    clientId: context.client.id,
    action: "task.quick_created",
    entityType: "task",
    entityId: task.id,
    metadata: {
      title,
      assignee_id: context.user.id,
      start_date: startDate,
      due_date: dueDate,
      priority: "normal",
    },
  });
  revalidatePath(`/clients/${context.client.id}`);
  revalidatePath("/my-work");

  return {
    taskId: task.id,
    taskTitle: title,
    clientId: context.client.id,
    clientName: context.client.name,
    listId: list.id,
    listParam: list.kind === "general" || list.kind === "recurring" ? list.kind : list.id,
    usedAi: false,
    warning: null,
  };
}

export async function saveAiSettings(formData: FormData) {
  const context = await requireAgency();
  requireAdmin(context.membership.role);
  const model = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9._:-]+$/).parse(formData.get("model"));
  const imageModel = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9._:-]+$/).parse(formData.get("image_model"));
  const apiKey = String(formData.get("api_key") ?? "").trim();
  const taskPrompt = z.string().trim().max(20_000).parse(formData.get("task_prompt") ?? "");
  if (apiKey) z.string().min(20).max(500).parse(apiKey);
  const enabled = formData.get("enabled") === "on";
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("agency_ai_settings")
    .select("encrypted_api_key")
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const encryptedApiKey = apiKey ? encryptSecret(apiKey) : existing?.encrypted_api_key ?? null;
  if (enabled && !encryptedApiKey && !process.env.OPENAI_API_KEY) {
    throw new Error("Add an OpenAI API key before enabling AI task parsing.");
  }

  const { error } = await admin.from("agency_ai_settings").upsert(
    {
      agency_id: context.agency.id,
      provider: "openai",
      model,
      image_model: imageModel,
      enabled,
      encrypted_api_key: encryptedApiKey,
      task_prompt: taskPrompt || null,
      updated_by: context.user.id,
    },
    { onConflict: "agency_id" },
  );
  if (isMissingAiSettingsColumn(error)) {
    throw new Error("Run Supabase migrations 0005_ai_task_prompt.sql and 0022_ai_image_model.sql to enable the full AI settings panel.");
  }
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "ai.settings_updated",
    entityType: "agency_ai_settings",
    metadata: {
      provider: "openai",
      model,
      image_model: imageModel,
      enabled,
      key_updated: Boolean(apiKey),
      task_prompt_customized: Boolean(taskPrompt),
    },
  });
  revalidatePath("/settings");
  revalidatePath("/clients");
}

export async function resetAiTaskPrompt() {
  const context = await requireAgency();
  requireAdmin(context.membership.role);
  const admin = createAdminClient();
  const { error } = await admin
    .from("agency_ai_settings")
    .update({ task_prompt: null, updated_by: context.user.id })
    .eq("agency_id", context.agency.id);
  if (isMissingAiSettingsColumn(error)) {
    throw new Error("Custom task prompts require Supabase migration 0005_ai_task_prompt.sql.");
  }
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "ai.task_prompt_reset",
    entityType: "agency_ai_settings",
  });
  revalidatePath("/settings");
  revalidatePath("/clients");
}

export async function removeAiSettings() {
  const context = await requireAgency();
  requireAdmin(context.membership.role);
  const admin = createAdminClient();
  const { error } = await admin.from("agency_ai_settings").upsert(
    {
      agency_id: context.agency.id,
      provider: "openai",
      model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
      image_model: process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL,
      enabled: false,
      encrypted_api_key: null,
      updated_by: context.user.id,
    },
    { onConflict: "agency_id" },
  );
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "ai.settings_removed",
    entityType: "agency_ai_settings",
  });
  revalidatePath("/settings");
  revalidatePath("/clients");
}
