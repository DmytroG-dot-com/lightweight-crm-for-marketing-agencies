import { DOSSIER_LABELS, DOSSIER_SECTIONS } from "@/lib/constants";
import { DOSSIER_SECTION_QUESTIONS } from "@/lib/dossier";
import {
  buildCsvLine,
  isBlankCsvRow,
  isCsvCommentRow,
  normalizeCsvHeader,
  parseCsv,
} from "@/lib/task-csv";

type DossierSection = (typeof DOSSIER_SECTIONS)[number];

export const DOSSIER_IMPORT_COLUMNS = [
  "section",
  "field",
  "label",
  "field_type",
  "value",
] as const;

type DossierImportColumn = (typeof DOSSIER_IMPORT_COLUMNS)[number];

export type DossierImportPatch = {
  rowNumber: number;
  section: DossierSection | "dossier";
  field: string;
  value: unknown;
  clear: boolean;
};

const MAX_IMPORT_ROWS = 500;
const safeCustomFieldPattern = /^[a-z0-9][a-z0-9_]{0,79}$/i;
const forbiddenCustomFields = new Set(["__proto__", "constructor", "prototype"]);

const sectionAliases = new Map<string, DossierSection | "dossier">([
  ["dossier", "dossier"],
  ["general", "dossier"],
  ["top_level", "dossier"],
  ...DOSSIER_SECTIONS.flatMap((section) => [
    [normalizeCsvHeader(section), section] as const,
    [normalizeCsvHeader(DOSSIER_LABELS[section]), section] as const,
  ]),
]);

const headerAliases: Record<string, DossierImportColumn> = {
  key: "field",
  field_key: "field",
  question_key: "field",
  question: "label",
  type: "field_type",
  content: "value",
  answer: "value",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sectionRecord(value: unknown) {
  if (isRecord(value)) return value;
  return value == null ? {} : { legacy_value: value };
}

function valueToCsv(value: unknown, fieldType: string) {
  if (value == null) return "";
  if (fieldType === "multi" && Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean).join("\n");
  }
  if (fieldType === "json") return JSON.stringify(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function normalizeImportHeader(value: string) {
  const normalized = normalizeCsvHeader(value);
  return headerAliases[normalized] ?? normalized;
}

function normalizeSection(value: string, rowNumber: number) {
  const normalized = normalizeCsvHeader(value);
  const section = sectionAliases.get(normalized);
  if (!section) {
    throw new Error(`Row ${rowNumber}: section must be dossier or one of ${DOSSIER_SECTIONS.join(", ")}.`);
  }
  return section;
}

function parseList(value: string) {
  return value
    .split(/\r?\n|\s*\|\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function knownField(
  section: DossierSection | "dossier",
  rawField: string,
  rawLabel: string,
) {
  const normalizedField = normalizeCsvHeader(rawField);
  const normalizedLabel = normalizeCsvHeader(rawLabel);

  if (section === "dossier") {
    if ([normalizedField, normalizedLabel].includes("knowledge_base")) return "knowledge_base";
    if ([normalizedField, normalizedLabel].includes("ai_summary")) return "ai_summary";
    return null;
  }

  if ([normalizedField, normalizedLabel].includes("notes") || [normalizedField, normalizedLabel].includes("section_notes")) {
    return "notes";
  }

  const questions = DOSSIER_SECTION_QUESTIONS[section];
  return questions.find((question) => (
    normalizeCsvHeader(question.key) === normalizedField
    || normalizeCsvHeader(question.label) === normalizedField
    || normalizeCsvHeader(question.label) === normalizedLabel
  ))?.key ?? null;
}

export function parseDossierImportCsv(csvText: string): DossierImportPatch[] {
  const parsedRows = parseCsv(csvText).map((cells, index) => ({ cells, rowNumber: index + 1 }));
  const headerRow = parsedRows.find(({ cells }) => !isBlankCsvRow(cells) && !isCsvCommentRow(cells));
  if (!headerRow) throw new Error("Could not find a CSV header row.");

  const normalizedHeader = headerRow.cells.map((value) => normalizeImportHeader(value));
  const headerIndexes = new Map<string, number>();
  normalizedHeader.forEach((column, index) => {
    if (!column) return;
    if (headerIndexes.has(column)) {
      throw new Error(`The CSV header contains "${column}" more than once.`);
    }
    headerIndexes.set(column, index);
  });

  for (const column of ["section", "field", "value"] as const) {
    if (!headerIndexes.has(column)) {
      throw new Error(`The CSV header is missing required column "${column}".`);
    }
  }

  const rows = parsedRows
    .filter(({ rowNumber }) => rowNumber > headerRow.rowNumber)
    .filter(({ cells }) => !isBlankCsvRow(cells) && !isCsvCommentRow(cells));
  if (!rows.length) throw new Error("The CSV does not contain any dossier field rows.");
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`A single CSV can contain at most ${MAX_IMPORT_ROWS} dossier field rows.`);
  }

  const seenFields = new Map<string, number>();
  return rows.map(({ cells, rowNumber }) => {
    if (cells.length > normalizedHeader.length) {
      throw new Error(`Row ${rowNumber}: too many columns. Check for an unquoted comma.`);
    }

    const values = [...cells];
    while (values.length < normalizedHeader.length) values.push("");
    const record = Object.fromEntries(
      DOSSIER_IMPORT_COLUMNS.map((column) => [
        column,
        headerIndexes.has(column) ? values[headerIndexes.get(column) ?? -1] ?? "" : "",
      ]),
    ) as Record<DossierImportColumn, string>;

    const section = normalizeSection(record.section, rowNumber);
    const rawField = record.field.trim();
    if (!rawField) throw new Error(`Row ${rowNumber}: field is required.`);
    const resolvedKnownField = knownField(section, rawField, record.label);
    const normalizedField = normalizeCsvHeader(rawField);
    const fieldType = normalizeCsvHeader(record.field_type);

    let field = resolvedKnownField;
    if (!field) {
      if (section === "dossier") {
        throw new Error(`Row ${rowNumber}: dossier fields must be knowledge_base or ai_summary.`);
      }
      if (fieldType !== "json") {
        throw new Error(`Row ${rowNumber}: unknown field "${rawField}" must use field_type json.`);
      }
      if (!safeCustomFieldPattern.test(normalizedField) || forbiddenCustomFields.has(normalizedField)) {
        throw new Error(`Row ${rowNumber}: invalid custom field key "${rawField}".`);
      }
      field = normalizedField;
    }

    const fieldKey = `${section}:${field}`;
    if (seenFields.has(fieldKey)) {
      throw new Error(`Row ${rowNumber}: ${section}.${field} is duplicated (first used on row ${seenFields.get(fieldKey)}).`);
    }
    seenFields.set(fieldKey, rowNumber);

    const trimmedValue = record.value.trim();
    if (!trimmedValue) {
      return { rowNumber, section, field, value: null, clear: true };
    }

    if (section !== "dossier") {
      const question = DOSSIER_SECTION_QUESTIONS[section].find((item) => item.key === field);
      if (question?.type === "multi") {
        return { rowNumber, section, field, value: parseList(trimmedValue), clear: false };
      }
      if (question?.type === "choice" && question.options?.length && !question.options.includes(trimmedValue)) {
        throw new Error(`Row ${rowNumber}: value for ${field} must be one of ${question.options.join(", ")}.`);
      }
    }

    if (!resolvedKnownField && fieldType === "json") {
      try {
        return { rowNumber, section, field, value: JSON.parse(trimmedValue), clear: false };
      } catch {
        throw new Error(`Row ${rowNumber}: value for custom field "${field}" must be valid JSON.`);
      }
    }

    return { rowNumber, section, field, value: trimmedValue, clear: false };
  });
}

export function buildDossierImportCsv(dossier: Record<string, unknown> | null) {
  const comment = (value: string) => buildCsvLine([`# ${value}`]);
  const lines = [
    comment("Agency CRM dossier import template"),
    comment("Edit values and upload this file from the client Dossier tab."),
    comment("Required columns: section, field, value. Keep section and field keys unchanged."),
    comment("Blank values clear that field. Fields omitted from the CSV stay unchanged."),
    comment("For multi fields use | or line breaks between list items."),
    comment("Existing custom fields use field_type json and must contain valid JSON."),
    buildCsvLine(DOSSIER_IMPORT_COLUMNS),
  ];

  for (const section of DOSSIER_SECTIONS) {
    const record = sectionRecord(dossier?.[section]);
    const knownKeys = new Set(DOSSIER_SECTION_QUESTIONS[section].map((question) => question.key));

    for (const question of DOSSIER_SECTION_QUESTIONS[section]) {
      lines.push(buildCsvLine([
        section,
        question.key,
        question.label,
        question.type,
        valueToCsv(record[question.key], question.type),
      ]));
    }

    lines.push(buildCsvLine([
      section,
      "notes",
      `${DOSSIER_LABELS[section]} section notes`,
      "long",
      valueToCsv(record.notes, "long"),
    ]));

    for (const [field, value] of Object.entries(record)) {
      if (field === "notes" || knownKeys.has(field)) continue;
      lines.push(buildCsvLine([
        section,
        field,
        field.replaceAll("_", " "),
        "json",
        valueToCsv(value, "json"),
      ]));
    }
  }

  lines.push(buildCsvLine([
    "dossier",
    "knowledge_base",
    "Knowledge base",
    "long",
    valueToCsv(dossier?.knowledge_base, "long"),
  ]));
  lines.push(buildCsvLine([
    "dossier",
    "ai_summary",
    "AI summary",
    "long",
    valueToCsv(dossier?.ai_summary, "long"),
  ]));

  return `${lines.join("\n")}\n`;
}
