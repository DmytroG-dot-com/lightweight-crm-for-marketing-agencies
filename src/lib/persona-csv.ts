import {
  buildCsvLine,
  isBlankCsvRow,
  isCsvCommentRow,
  normalizeCsvHeader,
  parseCsv,
} from "@/lib/task-csv";

export const PERSONA_IMPORT_COLUMNS = [
  "name",
  "segment",
  "profile_summary",
  "job_to_be_done",
  "pain_points",
  "desired_outcomes",
  "objections",
  "buying_triggers",
  "awareness_stage",
  "tone_preferences",
  "claim_sensitivity",
  "offer_fit",
  "source",
  "confidence_score",
  "active",
  "is_primary",
] as const;

export type PersonaImportColumn = (typeof PERSONA_IMPORT_COLUMNS)[number];
export type PersonaImportSource = "manual" | "onboarding" | "ai_research";

export type PersonaImportRow = {
  rowNumber: number;
  name: string;
  segment: string | null;
  profileSummary: string | null;
  jobToBeDone: string | null;
  painPoints: string[];
  desiredOutcomes: string[];
  objections: string[];
  buyingTriggers: string[];
  awarenessStage: string | null;
  tonePreferences: string | null;
  claimSensitivity: string | null;
  offerFit: string | null;
  source: PersonaImportSource;
  confidenceScore: number | null;
  active: boolean;
  isPrimary: boolean;
};

const MAX_IMPORT_ROWS = 250;
const personaSources = new Set<PersonaImportSource>(["manual", "onboarding", "ai_research"]);

function optional(value: string) {
  return value.trim() || null;
}

function parseList(value: string) {
  return value
    .split(/\r?\n|\s*\|\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: string, rowNumber: number, field: string, defaultValue: boolean) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["true", "yes", "y", "1", "on", "active", "primary"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "off", "inactive"].includes(normalized)) return false;
  throw new Error(`Row ${rowNumber}: ${field} must be true or false.`);
}

function parseSource(value: string, rowNumber: number): PersonaImportSource {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_") || "manual";
  if (!personaSources.has(normalized as PersonaImportSource)) {
    throw new Error(`Row ${rowNumber}: source must be one of manual, onboarding, ai_research.`);
  }
  return normalized as PersonaImportSource;
}

function parseConfidenceScore(value: string, rowNumber: number) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Row ${rowNumber}: confidence_score must be a whole number from 0 to 100.`);
  }
  const score = Number(normalized);
  if (score < 0 || score > 100) {
    throw new Error(`Row ${rowNumber}: confidence_score must be a whole number from 0 to 100.`);
  }
  return score;
}

export function parsePersonaImportCsv(csvText: string): PersonaImportRow[] {
  const parsedRows = parseCsv(csvText).map((cells, index) => ({
    rowNumber: index + 1,
    cells,
  }));
  const headerRow = parsedRows.find(({ cells }) => !isBlankCsvRow(cells) && !isCsvCommentRow(cells));
  if (!headerRow) throw new Error("Could not find a CSV header row.");

  const normalizedHeader = headerRow.cells.map((value) => normalizeCsvHeader(value));
  const headerIndexes = new Map<string, number>();
  normalizedHeader.forEach((column, index) => {
    if (!column) return;
    if (headerIndexes.has(column)) {
      throw new Error(`The CSV header contains "${column}" more than once.`);
    }
    headerIndexes.set(column, index);
  });

  if (!headerIndexes.has("name")) {
    throw new Error('The CSV header is missing required column "name".');
  }

  const rows = parsedRows
    .filter(({ rowNumber }) => rowNumber > headerRow.rowNumber)
    .filter(({ cells }) => !isBlankCsvRow(cells) && !isCsvCommentRow(cells));
  if (!rows.length) throw new Error("The CSV does not contain any persona rows.");
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`A single CSV can contain at most ${MAX_IMPORT_ROWS} persona rows.`);
  }

  return rows.map(({ rowNumber, cells }) => {
    if (cells.length > normalizedHeader.length) {
      throw new Error(`Row ${rowNumber}: too many columns. Check for an unquoted comma.`);
    }

    const values = [...cells];
    while (values.length < normalizedHeader.length) values.push("");
    const record = Object.fromEntries(
      PERSONA_IMPORT_COLUMNS.map((column) => [
        column,
        headerIndexes.has(column) ? values[headerIndexes.get(column) ?? -1] ?? "" : "",
      ]),
    ) as Record<PersonaImportColumn, string>;

    const name = record.name.trim();
    if (!name) throw new Error(`Row ${rowNumber}: name is required.`);
    if (name.length > 120) throw new Error(`Row ${rowNumber}: name must be 120 characters or fewer.`);

    return {
      rowNumber,
      name,
      segment: optional(record.segment),
      profileSummary: optional(record.profile_summary),
      jobToBeDone: optional(record.job_to_be_done),
      painPoints: parseList(record.pain_points),
      desiredOutcomes: parseList(record.desired_outcomes),
      objections: parseList(record.objections),
      buyingTriggers: parseList(record.buying_triggers),
      awarenessStage: optional(record.awareness_stage),
      tonePreferences: optional(record.tone_preferences),
      claimSensitivity: optional(record.claim_sensitivity),
      offerFit: optional(record.offer_fit),
      source: parseSource(record.source, rowNumber),
      confidenceScore: parseConfidenceScore(record.confidence_score, rowNumber),
      active: parseBoolean(record.active, rowNumber, "active", true),
      isPrimary: parseBoolean(record.is_primary, rowNumber, "is_primary", false),
    };
  });
}

export function buildPersonaImportTemplateCsv() {
  const comments = [
    "# Client ICP/persona import template",
    "# One row creates one persona. Required column: name.",
    "# Separate list items with | or with line breaks inside a quoted cell.",
    "# source values: manual / onboarding / ai_research. Blank defaults to manual.",
    "# active and is_primary: true or false. Blank active defaults to true.",
    "# confidence_score: a whole number from 0 to 100 or blank.",
    "# If this client already has a primary ICP, it remains primary.",
  ];
  const lines = [
    ...comments.map((comment) => buildCsvLine([comment])),
    buildCsvLine(PERSONA_IMPORT_COLUMNS),
    buildCsvLine([
      "Growth-focused founder",
      "Founder-led service businesses",
      "An owner responsible for growth who wants a reliable acquisition system without adding operational complexity.",
      "Build predictable qualified demand while staying focused on delivery.",
      "Inconsistent lead flow | Limited time to manage marketing | Unclear channel ROI",
      "Predictable pipeline | Clear reporting | A practical plan the team can execute",
      "Concerned about wasted spend | Skeptical of vague agency promises",
      "Missed revenue target | Recent hire needs pipeline | Current channel performance declined",
      "Solution-aware",
      "Direct, practical, commercially grounded",
      "Avoid guarantees and unsupported performance claims",
      "Best fit for a managed growth program with clear milestones",
      "manual",
      "80",
      "true",
      "true",
    ]),
  ];

  return `${lines.join("\n")}\n`;
}
