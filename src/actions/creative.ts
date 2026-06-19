"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { generateCreativeBriefWithAi, renderCreativeBrief } from "@/lib/ai/creative-brief";
import {
  buildCreativeImagePrompt,
  CREATIVE_IMAGE_QUALITIES,
  CREATIVE_IMAGE_SIZES,
  generateCreativeImagesWithAi,
  type CreativeImageQuality,
  type CreativeImageSize,
} from "@/lib/ai/creative-images";
import { getAgencyAiRuntimeSettings } from "@/lib/ai/settings";
import { requireAgency, requireClient } from "@/lib/auth";
import { CREATIVE_STATUSES } from "@/lib/constants";
import { linesToList } from "@/lib/personas";
import { addDaysToDateValue, dateInputValue } from "@/lib/utils";

const CREATIVE_EDITABLE_FIELDS = ["title", "status", "creator_id", "due_date"] as const;

const creativeFieldSchema = z.enum(CREATIVE_EDITABLE_FIELDS);
const personaSourceSchema = z.enum(["manual", "onboarding", "ai_research"]);

const creativeDetailsSchema = z.object({
  title: z.string().trim().min(1).max(180),
  hypothesis: z.string().trim().max(5000).optional(),
  status: z.enum(CREATIVE_STATUSES),
  due_date: z.string().date(),
  assets_needed: z.coerce.number().int().min(1),
  brief: z.string().trim().max(20000).optional(),
  references_url: z.string().trim().url().optional().or(z.literal("")),
  notes: z.string().trim().max(20000).optional(),
});

type CreativeStatus = (typeof CREATIVE_STATUSES)[number];

const optional = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim() || null;

function statusAfterCreatorAssigned(status: string): CreativeStatus {
  return status === "draft" || status === "ready" || status === "assigned"
    ? "in_progress"
    : status as CreativeStatus;
}

function relatedClientStatus(value: unknown) {
  const client = Array.isArray(value) ? value[0] : value;
  return client && typeof client === "object" && "status" in client
    ? String(client.status)
    : null;
}

function relatedClientName(value: unknown) {
  const client = Array.isArray(value) ? value[0] : value;
  return client && typeof client === "object" && "name" in client
    ? String(client.name)
    : "Client";
}

async function validateCreatorId(
  context: Awaited<ReturnType<typeof requireAgency>> | Awaited<ReturnType<typeof requireClient>>,
  creatorId: string | null,
) {
  if (!creatorId) return null;
  const { data: creator } = await context.supabase
    .from("external_creators")
    .select("id")
    .eq("id", creatorId)
    .eq("agency_id", context.agency.id)
    .eq("active", true)
    .maybeSingle();
  if (!creator) throw new Error("Invalid creator.");
  return creator.id;
}

async function validateSourceTaskId(
  context: Awaited<ReturnType<typeof requireClient>>,
  sourceTaskId: string | null,
) {
  if (!sourceTaskId) return null;
  const { data: sourceTask } = await context.supabase
    .from("tasks")
    .select("id")
    .eq("id", sourceTaskId)
    .eq("agency_id", context.agency.id)
    .eq("client_id", context.client.id)
    .is("archived_at", null)
    .maybeSingle();
  if (!sourceTask) throw new Error("Linked task must belong to this client and stay active.");
  return sourceTask.id;
}

async function validatePersonaId(
  context: Awaited<ReturnType<typeof requireAgency>> | Awaited<ReturnType<typeof requireClient>>,
  clientId: string,
  personaId: string | null,
) {
  if (!personaId) return null;
  const { data: persona } = await context.supabase
    .from("client_personas")
    .select("id")
    .eq("id", personaId)
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .eq("active", true)
    .maybeSingle();
  if (!persona) throw new Error("Invalid ICP.");
  return persona.id;
}

async function revalidateCreatorPortals(
  context: Awaited<ReturnType<typeof requireAgency>> | Awaited<ReturnType<typeof requireClient>>,
  creatorIds: Array<string | null | undefined>,
) {
  const ids = [...new Set(creatorIds.filter((value): value is string => Boolean(value)))];
  if (!ids.length) return;
  const { data: creators, error } = await context.supabase
    .from("external_creators")
    .select("portal_token")
    .eq("agency_id", context.agency.id)
    .in("id", ids);
  if (error) throw new Error(error.message);
  creators?.forEach((creator) => revalidatePath(`/creator/${creator.portal_token}`));
}

async function revalidateCreativeViews(
  context: Awaited<ReturnType<typeof requireAgency>> | Awaited<ReturnType<typeof requireClient>>,
  {
    clientId,
    creatorIds = [],
  }: {
    clientId: string;
    creatorIds?: Array<string | null | undefined>;
  },
) {
  revalidatePath("/creative-master");
  revalidatePath(`/clients/${clientId}`);
  await revalidateCreatorPortals(context, creatorIds);
}

export async function createCreativeRequest(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const context = await requireClient(clientId);
  if (context.client.status === "archived") throw new Error("Restore the client before creating creative work.");

  const title = z.string().trim().min(1).max(180).parse(formData.get("title"));
  const hypothesis = z.string().trim().max(5000).parse(String(formData.get("hypothesis") ?? "").trim() || title);
  const today = dateInputValue(new Date(), context.membership.timezone);
  const dueDate = z.string().date().parse(optional(formData, "due_date") ?? addDaysToDateValue(today, 4));
  const assetsNeeded = z.coerce.number().int().min(1).parse(formData.get("assets_needed") ?? "1");
  const creatorId = await validateCreatorId(context, optional(formData, "creator_id"));
  const personaId = await validatePersonaId(context, clientId, optional(formData, "persona_id"));
  const sourceTaskId = await validateSourceTaskId(context, optional(formData, "source_task_id"));

  const { data, error } = await context.supabase
    .from("creative_requests")
    .insert({
      agency_id: context.agency.id,
      client_id: clientId,
      title,
      hypothesis,
      status: creatorId ? "in_progress" : "draft",
      preferred_launch_date: dueDate,
      due_date: dueDate,
      assets_needed: assetsNeeded,
      brief: optional(formData, "brief"),
      references_url: optional(formData, "references_url"),
      notes: optional(formData, "notes"),
      creator_id: creatorId,
      persona_id: personaId,
      source_task_id: sourceTaskId,
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "creative_request.created",
    entityType: "creative_request",
    entityId: data.id,
    metadata: {
      title,
      creator_id: creatorId,
      persona_id: personaId,
      source_task_id: sourceTaskId,
      due_date: dueDate,
      assets_needed: assetsNeeded,
    },
  });
  await revalidateCreativeViews(context, { clientId, creatorIds: [creatorId] });
}

export async function updateCreativeField(formData: FormData) {
  const context = await requireAgency();
  const requestId = z.string().uuid().parse(formData.get("request_id"));
  const field = creativeFieldSchema.parse(formData.get("field"));
  const rawValue = String(formData.get("value") ?? "").trim();

  const { data: current, error: currentError } = await context.supabase
    .from("creative_requests")
    .select("id, client_id, status, creator_id, persona_id, archived_at, clients(status)")
    .eq("id", requestId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (!current) throw new Error("Creative request not found.");
  if (relatedClientStatus(current.clients) === "archived") throw new Error("Restore the client before updating creative work.");
  if (current.archived_at) throw new Error("Restore this creative request before editing it.");

  const updates: Record<string, string | null> = {};
  const previousCreatorId = current.creator_id;
  let nextCreatorId = current.creator_id;

  if (field === "title") {
    updates.title = z.string().trim().min(1).max(180).parse(rawValue);
  }

  if (field === "due_date") {
    const dueDate = z.string().date().parse(rawValue);
    updates.due_date = dueDate;
    updates.preferred_launch_date = dueDate;
  }

  if (field === "creator_id") {
    nextCreatorId = rawValue === (current.creator_id ?? "")
      ? current.creator_id
      : await validateCreatorId(context, rawValue || null);
    updates.creator_id = nextCreatorId;
    if (nextCreatorId && !current.creator_id) {
      updates.status = statusAfterCreatorAssigned(current.status);
    }
    if (!nextCreatorId && current.creator_id && current.status === "in_progress") {
      updates.status = "draft";
    }
  }

  if (field === "status") {
    const status = z.enum(CREATIVE_STATUSES).parse(rawValue);
    updates.status = status;
  }

  const { error } = await context.supabase
    .from("creative_requests")
    .update(updates)
    .eq("id", requestId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId: current.client_id,
    action: field === "status" ? "creative_request.status_changed" : "creative_request.updated",
    entityType: "creative_request",
    entityId: requestId,
    metadata: field === "status"
      ? { from_status: current.status, to_status: updates.status }
      : { field, value: updates[field] ?? null },
  });
  await revalidateCreativeViews(context, { clientId: current.client_id, creatorIds: [previousCreatorId, nextCreatorId] });
}

async function saveCreativeRequestDetails(
  formData: FormData,
  { logChanges, revalidateViews }: { logChanges: boolean; revalidateViews: boolean },
) {
  const context = await requireAgency();
  const requestId = z.string().uuid().parse(formData.get("request_id"));
  const { data: current, error: currentError } = await context.supabase
    .from("creative_requests")
    .select("id, client_id, creator_id, persona_id, archived_at, clients(status)")
    .eq("id", requestId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (!current) throw new Error("Creative request not found.");
  if (relatedClientStatus(current.clients) === "archived") throw new Error("Restore the client before updating creative work.");
  if (current.archived_at) throw new Error("Restore this creative request before editing it.");

  const parsed = creativeDetailsSchema.parse({
    title: formData.get("title"),
    hypothesis: formData.get("hypothesis"),
    status: formData.get("status"),
    due_date: formData.get("due_date"),
    assets_needed: formData.get("assets_needed"),
    brief: formData.get("brief"),
    references_url: formData.get("references_url"),
    notes: formData.get("notes"),
  });
  const creatorInput = optional(formData, "creator_id");
  const creatorId = creatorInput === (current.creator_id ?? "")
    ? current.creator_id
    : await validateCreatorId(context, creatorInput);
  const personaInput = optional(formData, "persona_id");
  const personaId = personaInput === (current.persona_id ?? "")
    ? current.persona_id
    : await validatePersonaId(context, current.client_id, personaInput);

  const clientContext = await requireClient(current.client_id);
  const sourceTaskId = await validateSourceTaskId(clientContext, optional(formData, "source_task_id"));
  let nextStatus = parsed.status;
  if (creatorId !== current.creator_id) {
    if (creatorId && !current.creator_id) {
      nextStatus = statusAfterCreatorAssigned(parsed.status);
    }
    if (!creatorId && current.creator_id && parsed.status === "in_progress") {
      nextStatus = "draft";
    }
  }

  const updates = {
    title: parsed.title,
    hypothesis: parsed.hypothesis?.trim() || parsed.title,
    status: nextStatus,
    due_date: parsed.due_date,
    preferred_launch_date: parsed.due_date,
    assets_needed: parsed.assets_needed,
    brief: parsed.brief?.trim() || null,
    references_url: parsed.references_url?.trim() || null,
    notes: parsed.notes?.trim() || null,
    creator_id: creatorId,
    persona_id: personaId,
    source_task_id: sourceTaskId,
  };

  const { error } = await context.supabase
    .from("creative_requests")
    .update(updates)
    .eq("id", requestId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);

  if (logChanges) {
    await logActivity(context.supabase, {
      agencyId: context.agency.id,
      actorId: context.user.id,
      clientId: current.client_id,
      action: "creative_request.updated",
      entityType: "creative_request",
      entityId: requestId,
      metadata: {
        title: updates.title,
        status: updates.status,
        creator_id: updates.creator_id,
        persona_id: updates.persona_id,
        source_task_id: updates.source_task_id,
        due_date: updates.due_date,
      },
    });
  }
  if (revalidateViews) {
    await revalidateCreativeViews(context, { clientId: current.client_id, creatorIds: [current.creator_id, creatorId] });
  }
}

export async function autosaveCreativeRequestDetails(formData: FormData) {
  await saveCreativeRequestDetails(formData, { logChanges: false, revalidateViews: false });
}

export async function updateCreativeRequestDetails(formData: FormData) {
  await saveCreativeRequestDetails(formData, { logChanges: true, revalidateViews: true });
}

export async function addCreativeRequestComment(formData: FormData) {
  const context = await requireAgency();
  const requestId = z.string().uuid().parse(formData.get("request_id"));
  const body = z.string().trim().min(1).max(10000).parse(formData.get("body"));
  const { data: request, error: requestError } = await context.supabase
    .from("creative_requests")
    .select("id, client_id, creator_id, archived_at, clients(status)")
    .eq("id", requestId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error("Creative request not found.");
  if (request.archived_at || relatedClientStatus(request.clients) === "archived") {
    throw new Error("Restore the client before commenting on creative work.");
  }

  const { error } = await context.supabase
    .from("creative_request_comments")
    .insert({
      agency_id: context.agency.id,
      creative_request_id: requestId,
      author_type: "agency",
      author_user_id: context.user.id,
      author_name: context.membership.display_name || context.membership.email || context.user.email || "Agency",
      body,
    });
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId: request.client_id,
    action: "creative_request.commented",
    entityType: "creative_request",
    entityId: requestId,
  });
  await revalidateCreativeViews(context, { clientId: request.client_id, creatorIds: [request.creator_id] });
}

export async function archiveCreativeRequest(formData: FormData) {
  const context = await requireAgency();
  const requestId = z.string().uuid().parse(formData.get("request_id"));
  const { data: request, error: requestError } = await context.supabase
    .from("creative_requests")
    .select("id, client_id, title, creator_id, archived_at, clients(status)")
    .eq("id", requestId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error("Creative request not found.");
  if (relatedClientStatus(request.clients) === "archived") throw new Error("Restore the client before updating creative work.");
  if (request.archived_at) throw new Error("Creative request is already archived.");

  const archivedAt = new Date().toISOString();
  const { error } = await context.supabase
    .from("creative_requests")
    .update({ archived_at: archivedAt })
    .eq("id", requestId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId: request.client_id,
    action: "creative_request.archived",
    entityType: "creative_request",
    entityId: requestId,
    metadata: { title: request.title },
  });
  await revalidateCreativeViews(context, { clientId: request.client_id, creatorIds: [request.creator_id] });
}

export async function restoreCreativeRequest(formData: FormData) {
  const context = await requireAgency();
  const requestId = z.string().uuid().parse(formData.get("request_id"));
  const { data: request, error: requestError } = await context.supabase
    .from("creative_requests")
    .select("id, client_id, title, creator_id, archived_at, clients(status)")
    .eq("id", requestId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error("Creative request not found.");
  if (!request.archived_at) throw new Error("Creative request is already active.");
  if (relatedClientStatus(request.clients) === "archived") throw new Error("Restore the client before restoring creative work.");

  const { error } = await context.supabase
    .from("creative_requests")
    .update({ archived_at: null })
    .eq("id", requestId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId: request.client_id,
    action: "creative_request.restored",
    entityType: "creative_request",
    entityId: requestId,
    metadata: { title: request.title },
  });
  await revalidateCreativeViews(context, { clientId: request.client_id, creatorIds: [request.creator_id] });
}

export async function createExternalCreator(formData: FormData) {
  const context = await requireAgency();
  const name = z.string().trim().min(1).parse(formData.get("name"));
  const email = z.string().trim().email().parse(formData.get("email"));
  const { data, error } = await context.supabase
    .from("external_creators")
    .insert({ agency_id: context.agency.id, name, email })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "external_creator.created",
    entityType: "external_creator",
    entityId: data.id,
  });
  revalidatePath("/settings");
  revalidatePath("/creative-master");
}

export async function upsertClientPersona(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const personaId = String(formData.get("persona_id") ?? "").trim() || null;
  const context = await requireClient(clientId);

  const active = formData.get("active") === "on";
  const requestedPrimary = formData.get("is_primary") === "on";
  const confidenceRaw = String(formData.get("confidence_score") ?? "").trim();
  const confidenceScore = confidenceRaw
    ? z.coerce.number().int().min(0).max(100).parse(confidenceRaw)
    : null;

  const { data: existingPrimary, error: primaryError } = await context.supabase
    .from("client_personas")
    .select("id")
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .eq("active", true)
    .eq("is_primary", true)
    .maybeSingle();
  if (primaryError) throw new Error(primaryError.message);

  const nextIsPrimary = active && (requestedPrimary || (!existingPrimary && !personaId));
  const payload = {
    agency_id: context.agency.id,
    client_id: clientId,
    name: z.string().trim().min(1).max(120).parse(formData.get("name")),
    segment: optional(formData, "segment"),
    profile_summary: optional(formData, "profile_summary"),
    job_to_be_done: optional(formData, "job_to_be_done"),
    pain_points: linesToList(String(formData.get("pain_points") ?? "")),
    desired_outcomes: linesToList(String(formData.get("desired_outcomes") ?? "")),
    objections: linesToList(String(formData.get("objections") ?? "")),
    buying_triggers: linesToList(String(formData.get("buying_triggers") ?? "")),
    awareness_stage: optional(formData, "awareness_stage"),
    tone_preferences: optional(formData, "tone_preferences"),
    claim_sensitivity: optional(formData, "claim_sensitivity"),
    offer_fit: optional(formData, "offer_fit"),
    source: personaSourceSchema.parse(formData.get("source") ?? "manual"),
    confidence_score: confidenceScore,
    active,
    is_primary: nextIsPrimary,
  };

  let savedPersonaId = personaId;

  if (personaId) {
    const { error } = await context.supabase
      .from("client_personas")
      .update(payload)
      .eq("id", personaId)
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await context.supabase
      .from("client_personas")
      .insert({ ...payload, created_by: context.user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    savedPersonaId = data.id;
  }

  if (nextIsPrimary && savedPersonaId) {
    const { error } = await context.supabase
      .from("client_personas")
      .update({ is_primary: false })
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
      .neq("id", savedPersonaId)
      .eq("active", true);
    if (error) throw new Error(error.message);
  }

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: personaId ? "client_persona.updated" : "client_persona.created",
    entityType: "client_persona",
    entityId: savedPersonaId,
    metadata: { name: payload.name, is_primary: nextIsPrimary, active },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/creative-master");
}

export async function deleteClientPersona(formData: FormData) {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const personaId = z.string().uuid().parse(formData.get("persona_id"));
  const context = await requireClient(clientId);
  const { data: persona, error: personaError } = await context.supabase
    .from("client_personas")
    .select("id, name")
    .eq("id", personaId)
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .maybeSingle();
  if (personaError) throw new Error(personaError.message);
  if (!persona) throw new Error("ICP not found.");

  const { error } = await context.supabase
    .from("client_personas")
    .delete()
    .eq("id", personaId)
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "client_persona.deleted",
    entityType: "client_persona",
    entityId: personaId,
    metadata: { name: persona.name },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/creative-master");
}

export async function generateCreativeBrief(formData: FormData) {
  const context = await requireAgency();
  const requestId = z.string().uuid().parse(formData.get("request_id"));
  const { data: request, error: requestError } = await context.supabase
    .from("creative_requests")
    .select("id, client_id, title, hypothesis, brief, notes, references_url, creator_id, persona_id, source_task_id, archived_at, clients(name, status)")
    .eq("id", requestId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error("Creative request not found.");
  if (request.archived_at || relatedClientStatus(request.clients) === "archived") {
    throw new Error("Restore the client before generating a brief.");
  }

  const aiSettings = await getAgencyAiRuntimeSettings(context.agency.id);
  if (!aiSettings) throw new Error("Enable OpenAI in Settings before generating briefs.");

  const { data: personas, error: personasError } = await context.supabase
    .from("client_personas")
    .select("*")
    .eq("agency_id", context.agency.id)
    .eq("client_id", request.client_id)
    .eq("active", true)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (personasError) throw new Error(personasError.message);

  const activePersonas = personas ?? [];
  if (!activePersonas.length) throw new Error("Add an ICP for this client before generating a brief.");

  const resolvedPersona = request.persona_id
    ? activePersonas.find((persona) => persona.id === request.persona_id) ?? null
    : activePersonas.find((persona) => persona.is_primary) ?? (activePersonas.length === 1 ? activePersonas[0] : null);
  if (!resolvedPersona) {
    throw new Error("Select an ICP on the creative request before generating a brief.");
  }

  const [
    { data: dossier, error: dossierError },
    { data: sourceTask, error: sourceTaskError },
  ] = await Promise.all([
    context.supabase
      .from("dossiers")
      .select("*")
      .eq("agency_id", context.agency.id)
      .eq("client_id", request.client_id)
      .maybeSingle(),
    request.source_task_id
      ? context.supabase
        .from("tasks")
        .select("id, title, description, status, priority")
        .eq("agency_id", context.agency.id)
        .eq("client_id", request.client_id)
        .eq("id", request.source_task_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (dossierError || sourceTaskError) throw new Error(dossierError?.message || sourceTaskError?.message);

  const briefContext = {
    generated_at: new Date().toISOString(),
    client: {
      id: request.client_id,
      name: relatedClientName(request.clients),
    },
    creative_request: {
      id: request.id,
      title: request.title,
      hypothesis: request.hypothesis,
      notes: request.notes,
      references_url: request.references_url,
    },
    persona: {
      id: resolvedPersona.id,
      name: resolvedPersona.name,
      segment: resolvedPersona.segment,
      profile_summary: resolvedPersona.profile_summary,
      job_to_be_done: resolvedPersona.job_to_be_done,
      pain_points: resolvedPersona.pain_points,
      desired_outcomes: resolvedPersona.desired_outcomes,
      objections: resolvedPersona.objections,
      buying_triggers: resolvedPersona.buying_triggers,
      awareness_stage: resolvedPersona.awareness_stage,
      tone_preferences: resolvedPersona.tone_preferences,
      claim_sensitivity: resolvedPersona.claim_sensitivity,
      offer_fit: resolvedPersona.offer_fit,
      source: resolvedPersona.source,
      confidence_score: resolvedPersona.confidence_score,
    },
    dossier: dossier ?? {},
    source_task: sourceTask,
  };

  const briefJson = await generateCreativeBriefWithAi({
    settings: aiSettings,
    context: briefContext,
  });
  const brief = renderCreativeBrief(briefJson);
  const generatedAt = new Date().toISOString();

  const { error } = await context.supabase
    .from("creative_requests")
    .update({
      persona_id: resolvedPersona.id,
      brief,
      brief_json: briefJson,
      brief_context_snapshot: {
        ...briefContext,
        model: aiSettings.model,
        provider: aiSettings.provider,
      },
      brief_generated_at: generatedAt,
    })
    .eq("id", requestId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId: request.client_id,
    action: "creative_request.brief_generated",
    entityType: "creative_request",
    entityId: requestId,
    metadata: {
      persona_id: resolvedPersona.id,
      model: aiSettings.model,
    },
  });
  await revalidateCreativeViews(context, { clientId: request.client_id, creatorIds: [request.creator_id] });
}

const imageSizeSchema = z.enum(CREATIVE_IMAGE_SIZES);
const imageQualitySchema = z.enum(CREATIVE_IMAGE_QUALITIES);

export async function generateCreativeImages(formData: FormData) {
  const context = await requireAgency();
  const requestId = z.string().uuid().parse(formData.get("request_id"));
  const size = imageSizeSchema.parse(formData.get("size") ?? "1024x1536");
  const quality = imageQualitySchema.parse(formData.get("quality") ?? "medium");

  const { data: request, error: requestError } = await context.supabase
    .from("creative_requests")
    .select("id, order_number, client_id, title, hypothesis, brief, brief_json, notes, persona_id, creator_id, assets_needed, archived_at, clients(name, status)")
    .eq("id", requestId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error("Creative request not found.");
  if (request.archived_at || relatedClientStatus(request.clients) === "archived") {
    throw new Error("Restore the client before generating images.");
  }

  const imageCount = z.coerce.number().int().min(1).parse(formData.get("count") ?? String(request.assets_needed ?? 1));
  const aiSettings = await getAgencyAiRuntimeSettings(context.agency.id);
  if (!aiSettings) throw new Error("Enable OpenAI in Settings before generating images.");

  const { data: personas, error: personasError } = await context.supabase
    .from("client_personas")
    .select("id, name, profile_summary, is_primary, active")
    .eq("agency_id", context.agency.id)
    .eq("client_id", request.client_id)
    .eq("active", true)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (personasError) throw new Error(personasError.message);

  const activePersonas = personas ?? [];
  const resolvedPersona = request.persona_id
    ? activePersonas.find((persona) => persona.id === request.persona_id) ?? null
    : activePersonas.find((persona) => persona.is_primary) ?? (activePersonas.length === 1 ? activePersonas[0] : null);

  const prompt = buildCreativeImagePrompt({
    title: request.title,
    hypothesis: request.hypothesis,
    brief: request.brief,
    briefJson: request.brief_json,
    notes: request.notes,
    personaName: resolvedPersona?.name ?? null,
    personaSummary: resolvedPersona?.profile_summary ?? null,
  });

  if (!request.brief?.trim() && !request.brief_json) {
    throw new Error("Generate or write a brief first so image direction is specific.");
  }

  const images = await generateCreativeImagesWithAi({
    apiKey: aiSettings.apiKey,
    model: aiSettings.imageModel,
    prompt,
    count: imageCount,
    size: size as CreativeImageSize,
    quality: quality as CreativeImageQuality,
    filenamePrefix: `creative-${request.order_number}`,
  });

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId: request.client_id,
    action: "creative_request.images_generated",
    entityType: "creative_request",
    entityId: requestId,
    metadata: {
      count: images.length,
      size,
      quality,
      model: aiSettings.imageModel,
    },
  });

  return {
    prompt,
    images,
  };
}
