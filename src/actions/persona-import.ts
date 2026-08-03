"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireClient } from "@/lib/auth";
import { parsePersonaImportCsv } from "@/lib/persona-csv";

type PersonaCsvImportResult =
  | { ok: true; message: string; personaCount: number }
  | { ok: false; error: string };

const MAX_CSV_BYTES = 1_000_000;

export async function importPersonaCsv(formData: FormData): Promise<PersonaCsvImportResult> {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const fileEntry = formData.get("file");

  if (!(fileEntry instanceof File)) {
    return { ok: false, error: "Choose a CSV file to import." };
  }
  if (fileEntry.size > MAX_CSV_BYTES) {
    return { ok: false, error: "The CSV file must be smaller than 1 MB." };
  }

  const csvText = await fileEntry.text();
  if (!csvText.trim()) return { ok: false, error: "The CSV file is empty." };

  let importRows;
  try {
    importRows = parsePersonaImportCsv(csvText);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not parse the CSV file.",
    };
  }

  const context = await requireClient(clientId);
  const { data: existingPrimary, error: primaryError } = await context.supabase
    .from("client_personas")
    .select("id")
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .eq("active", true)
    .eq("is_primary", true)
    .maybeSingle();
  if (primaryError) throw new Error(primaryError.message);

  const primaryRow = existingPrimary
    ? null
    : importRows.find((row) => row.active && row.isPrimary)
      ?? importRows.find((row) => row.active)
      ?? null;

  const payload = importRows.map((row) => ({
    agency_id: context.agency.id,
    client_id: clientId,
    name: row.name,
    segment: row.segment,
    profile_summary: row.profileSummary,
    job_to_be_done: row.jobToBeDone,
    pain_points: row.painPoints,
    desired_outcomes: row.desiredOutcomes,
    objections: row.objections,
    buying_triggers: row.buyingTriggers,
    awareness_stage: row.awarenessStage,
    tone_preferences: row.tonePreferences,
    claim_sensitivity: row.claimSensitivity,
    offer_fit: row.offerFit,
    source: row.source,
    confidence_score: row.confidenceScore,
    active: row.active,
    is_primary: row === primaryRow,
    created_by: context.user.id,
  }));

  const { data: createdPersonas, error: insertError } = await context.supabase
    .from("client_personas")
    .insert(payload)
    .select("id, name, is_primary");
  if (insertError) {
    return { ok: false, error: `Could not import personas: ${insertError.message}` };
  }

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "client_persona_import.completed",
    entityType: "client_persona_import",
    metadata: {
      file_name: fileEntry.name || null,
      persona_count: createdPersonas.length,
      persona_names: createdPersonas.map((persona) => persona.name),
      assigned_primary: createdPersonas.find((persona) => persona.is_primary)?.id ?? null,
    },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/creative-master");

  return {
    ok: true,
    message: `Imported ${createdPersonas.length} persona${createdPersonas.length === 1 ? "" : "s"}.`,
    personaCount: createdPersonas.length,
  };
}
