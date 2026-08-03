"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireClient } from "@/lib/auth";
import { DOSSIER_SECTIONS } from "@/lib/constants";
import { parseDossierImportCsv } from "@/lib/dossier-csv";

type DossierCsvImportResult =
  | { ok: true; message: string; fieldCount: number }
  | { ok: false; error: string };

const MAX_CSV_BYTES = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function importDossierCsv(formData: FormData): Promise<DossierCsvImportResult> {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) return { ok: false, error: "Choose a CSV file to import." };
  if (fileEntry.size > MAX_CSV_BYTES) return { ok: false, error: "The CSV file must be smaller than 1 MB." };

  const csvText = await fileEntry.text();
  if (!csvText.trim()) return { ok: false, error: "The CSV file is empty." };

  let patches;
  try {
    patches = parseDossierImportCsv(csvText);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not parse the CSV file.",
    };
  }

  const context = await requireClient(clientId);
  const { data: existingDossier, error: dossierError } = await context.supabase
    .from("dossiers")
    .select("*")
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .maybeSingle();
  if (dossierError) throw new Error(dossierError.message);

  const sectionValues = Object.fromEntries(DOSSIER_SECTIONS.map((section) => {
    const existingValue = existingDossier?.[section];
    const nextValue: Record<string, unknown> = isRecord(existingValue)
      ? { ...existingValue }
      : existingValue == null
        ? {}
        : { legacy_value: existingValue };

    for (const patch of patches) {
      if (patch.section !== section) continue;
      if (patch.clear) delete nextValue[patch.field];
      else nextValue[patch.field] = patch.value;
    }
    return [section, nextValue];
  }));

  let knowledgeBase = existingDossier?.knowledge_base ?? null;
  let aiSummary = existingDossier?.ai_summary ?? null;
  for (const patch of patches) {
    if (patch.section !== "dossier") continue;
    const value = patch.clear ? null : String(patch.value);
    if (patch.field === "knowledge_base") knowledgeBase = value;
    if (patch.field === "ai_summary") aiSummary = value;
  }

  const { error: upsertError } = await context.supabase.from("dossiers").upsert(
    {
      agency_id: context.agency.id,
      client_id: clientId,
      ...sectionValues,
      knowledge_base: knowledgeBase,
      ai_summary: aiSummary,
    },
    { onConflict: "client_id" },
  );
  if (upsertError) return { ok: false, error: `Could not import dossier: ${upsertError.message}` };

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "dossier_import.completed",
    entityType: "dossier",
    metadata: {
      file_name: fileEntry.name || null,
      field_count: patches.length,
    },
  });
  revalidatePath(`/clients/${clientId}`);

  return {
    ok: true,
    message: `Imported ${patches.length} dossier field${patches.length === 1 ? "" : "s"}.`,
    fieldCount: patches.length,
  };
}
