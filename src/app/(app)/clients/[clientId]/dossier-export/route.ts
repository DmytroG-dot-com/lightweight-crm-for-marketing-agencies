import { DOSSIER_LABELS, DOSSIER_SECTIONS } from "@/lib/constants";
import { DOSSIER_SECTION_QUESTIONS } from "@/lib/dossier";
import { requireClient } from "@/lib/auth";
import { formatDateTime, formatLabel } from "@/lib/utils";

type DossierSection = (typeof DOSSIER_SECTIONS)[number];

type PersonaRecord = {
  id: string;
  name: string;
  segment: string | null;
  profile_summary: string | null;
  job_to_be_done: string | null;
  pain_points: unknown;
  desired_outcomes: unknown;
  objections: unknown;
  buying_triggers: unknown;
  awareness_stage: string | null;
  tone_preferences: string | null;
  claim_sensitivity: string | null;
  offer_fit: string | null;
  source: string;
  confidence_score: number | null;
  active: boolean;
  is_primary: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toInlineText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function toListItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => toInlineText(item))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function pushLine(lines: string[], value = "") {
  lines.push(value);
}

function pushTextBlock(lines: string[], title: string, value: unknown) {
  const text = toInlineText(value);
  if (!text) return;
  pushLine(lines, `### ${title}`);
  pushLine(lines);
  pushLine(lines, text);
  pushLine(lines);
}

function pushListBlock(lines: string[], title: string, value: unknown) {
  const items = toListItems(value);
  if (!items.length) return;
  pushLine(lines, `### ${title}`);
  pushLine(lines);
  for (const item of items) {
    pushLine(lines, `- ${item}`);
  }
  pushLine(lines);
}

function pushInlineField(lines: string[], label: string, value: unknown) {
  const text = toInlineText(value);
  if (!text) return;
  pushLine(lines, `- **${label}:** ${text}`);
}

function pushGenericBlock(lines: string[], title: string, value: unknown) {
  if (value == null) return;
  if (Array.isArray(value)) {
    pushListBlock(lines, title, value);
    return;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, item]) => {
      if (Array.isArray(item)) return item.length > 0;
      if (isRecord(item)) return Object.keys(item).length > 0;
      return Boolean(toInlineText(item));
    });
    if (!entries.length) return;

    pushLine(lines, `### ${title}`);
    pushLine(lines);
    for (const [key, item] of entries) {
      if (Array.isArray(item)) {
        pushLine(lines, `#### ${formatLabel(key)}`);
        pushLine(lines);
        for (const listItem of toListItems(item)) {
          pushLine(lines, `- ${listItem}`);
        }
        pushLine(lines);
        continue;
      }

      if (isRecord(item)) {
        pushLine(lines, `#### ${formatLabel(key)}`);
        pushLine(lines);
        for (const [nestedKey, nestedValue] of Object.entries(item)) {
          const nestedText = toInlineText(nestedValue);
          if (!nestedText) continue;
          pushLine(lines, `- **${formatLabel(nestedKey)}:** ${nestedText}`);
        }
        pushLine(lines);
        continue;
      }

      pushLine(lines, `- **${formatLabel(key)}:** ${toInlineText(item)}`);
    }
    pushLine(lines);
    return;
  }

  pushTextBlock(lines, title, value);
}

function sanitizeFilePart(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "client";
}

function buildSectionMarkdown(lines: string[], section: DossierSection, dossier: Record<string, unknown> | null) {
  pushLine(lines, `## ${DOSSIER_LABELS[section]}`);
  pushLine(lines);

  const sectionValue = dossier?.[section];
  const sectionRecord = isRecord(sectionValue) ? sectionValue : {};
  const knownKeys = new Set(DOSSIER_SECTION_QUESTIONS[section].map((question) => question.key));
  let wroteContent = false;

  for (const question of DOSSIER_SECTION_QUESTIONS[section]) {
    const value = sectionRecord[question.key];

    if (question.type === "long") {
      const before = lines.length;
      pushTextBlock(lines, question.label, value);
      wroteContent ||= lines.length > before;
      continue;
    }

    if (question.type === "multi") {
      const before = lines.length;
      pushListBlock(lines, question.label, value);
      wroteContent ||= lines.length > before;
      continue;
    }

    const text = toInlineText(value);
    if (!text) continue;
    wroteContent = true;
    pushInlineField(lines, question.label, text);
  }

  if (wroteContent) {
    pushLine(lines);
  }

  const notes = sectionRecord.notes;
  const beforeNotes = lines.length;
  pushTextBlock(lines, "Section notes", notes);
  wroteContent ||= lines.length > beforeNotes;

  const preservedEntries = Object.entries(sectionRecord).filter(
    ([key]) => key !== "notes" && !knownKeys.has(key),
  );
  for (const [key, value] of preservedEntries) {
    const before = lines.length;
    pushGenericBlock(lines, formatLabel(key), value);
    wroteContent ||= lines.length > before;
  }

  if (!wroteContent) {
    pushLine(lines, "_No information saved in this section yet._");
    pushLine(lines);
  }
}

function buildPersonaMarkdown(lines: string[], personas: PersonaRecord[]) {
  pushLine(lines, "## ICPs / Personas");
  pushLine(lines);

  if (!personas.length) {
    pushLine(lines, "_No personas saved yet._");
    pushLine(lines);
    return;
  }

  for (const persona of personas) {
    pushLine(lines, `### ${persona.name}`);
    pushLine(lines);
    pushLine(lines, `- **Primary:** ${persona.is_primary ? "Yes" : "No"}`);
    pushLine(lines, `- **Active:** ${persona.active ? "Yes" : "No"}`);
    pushInlineField(lines, "Segment", persona.segment);
    pushInlineField(lines, "Awareness stage", persona.awareness_stage);
    pushInlineField(lines, "Source", formatLabel(persona.source));
    if (persona.confidence_score != null) {
      pushInlineField(lines, "Confidence score", persona.confidence_score);
    }
    pushLine(lines);

    pushTextBlock(lines, "Who this ICP is", persona.profile_summary);
    pushTextBlock(lines, "Job to be done", persona.job_to_be_done);
    pushListBlock(lines, "Pain points", persona.pain_points);
    pushListBlock(lines, "Desired outcomes", persona.desired_outcomes);
    pushListBlock(lines, "Objections / resistance", persona.objections);
    pushListBlock(lines, "Buying triggers", persona.buying_triggers);
    pushTextBlock(lines, "Tone preferences", persona.tone_preferences);
    pushTextBlock(lines, "Claim sensitivity", persona.claim_sensitivity);
    pushTextBlock(lines, "Offer fit", persona.offer_fit);
  }
}

function buildDossierMarkdown({
  agencyName,
  client,
  dossier,
  personas,
  exportedAt,
  timeZone,
}: {
  agencyName: string;
  client: {
    name: string;
    company_name: string | null;
    contact_name: string | null;
    contact_email: string | null;
    website: string | null;
    notes: string | null;
    status: string;
  };
  dossier: Record<string, unknown> | null;
  personas: PersonaRecord[];
  exportedAt: Date;
  timeZone: string;
}) {
  const lines: string[] = [];

  pushLine(lines, `# ${client.name} Dossier`);
  pushLine(lines);
  pushLine(lines, `- **Agency:** ${agencyName}`);
  pushLine(lines, `- **Client:** ${client.name}`);
  pushInlineField(lines, "Company", client.company_name);
  pushInlineField(lines, "Primary contact", client.contact_name);
  pushInlineField(lines, "Contact email", client.contact_email);
  pushInlineField(lines, "Website", client.website);
  pushInlineField(lines, "Status", formatLabel(client.status));
  pushLine(lines, `- **Exported:** ${formatDateTime(exportedAt, timeZone)}`);
  pushLine(lines);

  pushTextBlock(lines, "Client notes", client.notes);

  for (const section of DOSSIER_SECTIONS) {
    buildSectionMarkdown(lines, section, dossier);
  }

  pushLine(lines, "## Knowledge Base");
  pushLine(lines);
  if (toInlineText(dossier?.knowledge_base)) {
    pushLine(lines, String(dossier?.knowledge_base).trim());
  } else {
    pushLine(lines, "_No knowledge base notes saved yet._");
  }
  pushLine(lines);

  pushLine(lines, "## AI Summary");
  pushLine(lines);
  if (toInlineText(dossier?.ai_summary)) {
    pushLine(lines, String(dossier?.ai_summary).trim());
  } else {
    pushLine(lines, "_No AI summary saved yet._");
  }
  pushLine(lines);

  buildPersonaMarkdown(lines, personas);

  return `${lines.join("\n").trim()}\n`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  const context = await requireClient(clientId);

  const [{ data: dossier, error: dossierError }, { data: personas, error: personasError }] = await Promise.all([
    context.supabase
      .from("dossiers")
      .select("*")
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
      .maybeSingle(),
    context.supabase
      .from("client_personas")
      .select("*")
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("created_at"),
  ]);

  if (dossierError) throw new Error(dossierError.message);
  if (personasError) throw new Error(personasError.message);

  const markdown = buildDossierMarkdown({
    agencyName: context.agency.name,
    client: {
      name: context.client.name,
      company_name: context.client.company_name,
      contact_name: context.client.contact_name,
      contact_email: context.client.contact_email,
      website: context.client.website,
      notes: context.client.notes,
      status: context.client.status,
    },
    dossier: dossier as Record<string, unknown> | null,
    personas: (personas ?? []) as PersonaRecord[],
    exportedAt: new Date(),
    timeZone: context.membership.timezone,
  });

  const filename = `${sanitizeFilePart(context.client.name)}-dossier.md`;

  return new Response(markdown, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
