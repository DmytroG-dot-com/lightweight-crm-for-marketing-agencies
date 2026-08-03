import { DOSSIER_LABELS } from "@/lib/constants";
import {
  ONBOARDING_TARGETS,
  ONBOARDING_QUESTION_TYPES,
  type OnboardingQuestion,
  type OnboardingQuestionTarget,
  type OnboardingQuestionType,
  type OnboardingTemplateSchema,
  sanitizeOnboardingTemplateSchema,
} from "@/lib/onboarding";
import { buildCsvLine, isBlankCsvRow, isCsvCommentRow, normalizeCsvHeader, parseCsv } from "@/lib/task-csv";

export const ONBOARDING_TEMPLATE_IMPORT_COLUMNS = [
  "section_title",
  "section_description",
  "question_label",
  "field_type",
  "target",
  "required",
  "placeholder",
  "options",
  "section_key",
  "question_key",
] as const;

type OnboardingTemplateImportColumn = (typeof ONBOARDING_TEMPLATE_IMPORT_COLUMNS)[number];

type DraftGroup = {
  key?: string;
  title: string;
  description: string;
  questions: OnboardingQuestion[];
};

const requiredColumns = new Set<OnboardingTemplateImportColumn>([
  "section_title",
  "question_label",
  "field_type",
]);

const HEADER_ALIASES: Record<string, OnboardingTemplateImportColumn> = {
  section: "section_title",
  group: "section_title",
  group_title: "section_title",
  title: "question_label",
  question: "question_label",
  label: "question_label",
  question_title: "question_label",
  type: "field_type",
  question_type: "field_type",
  dossier_target: "target",
  mapping_target: "target",
};

const QUESTION_TYPE_ALIASES: Record<string, OnboardingQuestionType> = {
  short: "short",
  short_text: "short",
  text: "short",
  long: "long",
  long_text: "long",
  textarea: "long",
  paragraph: "long",
  email: "email",
  url: "url",
  website: "url",
  link: "url",
  choice: "choice",
  single_choice: "choice",
  single_select: "choice",
  dropdown: "choice",
  select: "choice",
  radio: "choice",
  multi: "multi",
  multi_select: "multi",
  multiple_choice: "multi",
  checkboxes: "multi",
  checkbox: "multi",
};

const TARGET_ALIASES: Record<string, OnboardingQuestionTarget> = {
  none: "none",
  knowledge_base: "knowledge_base",
  knowledge: "knowledge_base",
  "knowledge base": "knowledge_base",
  onboarding: "none",
};

const targetAliasEntries: Array<[string, OnboardingQuestionTarget]> = Object.entries(DOSSIER_LABELS).map(
  ([key, label]) => [normalizeCsvHeader(label), key as OnboardingQuestionTarget],
);

for (const [alias, target] of targetAliasEntries) {
  TARGET_ALIASES[alias] = target;
}

function normalizedString(value: string | undefined) {
  return (value ?? "").trim();
}

function normalizeImportHeader(value: string) {
  const normalized = normalizeCsvHeader(value);
  return HEADER_ALIASES[normalized] ?? normalized;
}

function normalizeQuestionType(value: string, rowNumber: number) {
  const normalized = normalizeCsvHeader(value);
  const type = QUESTION_TYPE_ALIASES[normalized] ?? (ONBOARDING_QUESTION_TYPES.includes(normalized as OnboardingQuestionType)
    ? normalized as OnboardingQuestionType
    : null);
  if (!type) {
    throw new Error(`Row ${rowNumber}: field_type must be one of ${ONBOARDING_QUESTION_TYPES.join(", ")}.`);
  }
  return type;
}

function normalizeQuestionTarget(value: string) {
  const normalized = normalizeImportHeader(value);
  if (!normalized) return "none";
  const target = TARGET_ALIASES[normalized] ?? (ONBOARDING_TARGETS.includes(normalized as OnboardingQuestionTarget)
    ? normalized as OnboardingQuestionTarget
    : null);
  if (!target) {
    throw new Error(`Invalid dossier target "${value}".`);
  }
  return target;
}

function parseRequiredFlag(value: string, rowNumber: number) {
  const normalized = normalizeCsvHeader(value);
  if (!normalized) return false;
  if (["true", "yes", "y", "1", "required"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "optional"].includes(normalized)) return false;
  throw new Error(`Row ${rowNumber}: required must be yes/no, true/false, or 1/0.`);
}

function parseOptions(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const separator = trimmed.includes("|")
    ? "|"
    : trimmed.includes("\n")
      ? "\n"
      : trimmed.includes(";")
        ? ";"
        : null;
  const values = (separator ? trimmed.split(separator) : [trimmed])
    .map((option) => option.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

function toDraftGroups(rows: string[][]) {
  const headerRowIndex = rows.findIndex((cells) => !isBlankCsvRow(cells) && !isCsvCommentRow(cells));
  if (headerRowIndex === -1) {
    throw new Error("Could not find a CSV header row.");
  }

  const normalizedHeader = rows[headerRowIndex].map((value) => normalizeImportHeader(value));
  const headerIndexes = new Map<string, number>();
  normalizedHeader.forEach((column, index) => {
    if (!column) return;
    if (headerIndexes.has(column)) {
      throw new Error(`The CSV header contains "${column}" more than once.`);
    }
    headerIndexes.set(column, index);
  });

  for (const column of requiredColumns) {
    if (!headerIndexes.has(column)) {
      throw new Error(`The CSV header is missing required column "${column}".`);
    }
  }

  const draftGroups: DraftGroup[] = [];
  const groupsByKey = new Map<string, DraftGroup>();
  let currentSectionKey = "";

  rows
    .map((cells, index) => ({ cells, rowNumber: index + 1 }))
    .filter(({ rowNumber }) => rowNumber > headerRowIndex + 1)
    .filter(({ cells }) => !isBlankCsvRow(cells) && !isCsvCommentRow(cells))
    .forEach(({ cells, rowNumber }) => {
      if (cells.length > normalizedHeader.length) {
        throw new Error(`Row ${rowNumber}: too many columns. Check for an unquoted comma.`);
      }

      const values = [...cells];
      while (values.length < normalizedHeader.length) values.push("");

      const rowRecord = Object.fromEntries(
        ONBOARDING_TEMPLATE_IMPORT_COLUMNS.map((column) => [
          column,
          headerIndexes.has(column) ? values[headerIndexes.get(column) ?? -1] ?? "" : "",
        ]),
      ) as Record<OnboardingTemplateImportColumn, string>;

      const sectionTitleInput = normalizedString(rowRecord.section_title);
      const sectionKeyInput = normalizedString(rowRecord.section_key);
      const questionLabel = normalizedString(rowRecord.question_label);
      const fieldType = normalizeQuestionType(rowRecord.field_type, rowNumber);
      const target = normalizeQuestionTarget(rowRecord.target);
      const required = parseRequiredFlag(rowRecord.required, rowNumber);
      const placeholder = normalizedString(rowRecord.placeholder) || undefined;
      const options = parseOptions(rowRecord.options);

      if (!questionLabel) {
        throw new Error(`Row ${rowNumber}: question_label is required.`);
      }

      const sectionLookup = normalizeCsvHeader(sectionKeyInput || sectionTitleInput || currentSectionKey);
      if (!sectionLookup) {
        throw new Error(`Row ${rowNumber}: section_title is required on the first row of a section.`);
      }
      currentSectionKey = sectionLookup;

      let group = groupsByKey.get(sectionLookup);
      if (!group) {
        if (!sectionTitleInput) {
          throw new Error(`Row ${rowNumber}: section_title is required when starting a new section.`);
        }
        group = {
          key: sectionKeyInput || undefined,
          title: sectionTitleInput,
          description: normalizedString(rowRecord.section_description),
          questions: [],
        };
        groupsByKey.set(sectionLookup, group);
        draftGroups.push(group);
      } else {
        if (sectionTitleInput && group.title !== sectionTitleInput) {
          group.title = sectionTitleInput;
        }
        if (!group.description && normalizedString(rowRecord.section_description)) {
          group.description = normalizedString(rowRecord.section_description);
        }
        if (!group.key && sectionKeyInput) {
          group.key = sectionKeyInput;
        }
      }

      group.questions.push({
        key: normalizedString(rowRecord.question_key) || questionLabel,
        target,
        label: questionLabel,
        type: fieldType,
        required,
        placeholder,
        options,
      });
    });

  if (!draftGroups.length) {
    throw new Error("The CSV does not contain any onboarding question rows.");
  }

  return draftGroups;
}

export function parseOnboardingTemplateCsv(csvText: string): OnboardingTemplateSchema {
  const rows = parseCsv(csvText);
  const groups = toDraftGroups(rows);
  return sanitizeOnboardingTemplateSchema({
    version: 1,
    groups,
  });
}

export function buildOnboardingTemplateImportCsv() {
  const targetValues = ["none", "knowledge_base", ...Object.keys(DOSSIER_LABELS)];
  const comment = (value: string) => buildCsvLine([`# ${value}`]);
  const lines = [
    comment("Agency CRM onboarding template import"),
    comment("Create one row per question."),
    comment("Required columns: section_title, question_label, field_type"),
    comment(`field_type: ${ONBOARDING_QUESTION_TYPES.join(", ")}`),
    comment(`target: ${targetValues.join(", ")}`),
    comment("required: yes or no"),
    comment("options: use | between options for choice or multi fields"),
    comment("section_key and question_key are optional"),
    comment(""),
    buildCsvLine(ONBOARDING_TEMPLATE_IMPORT_COLUMNS),
    buildCsvLine([
      "Business basics",
      "Core contact and company information.",
      "Primary contact name and role",
      "short",
      "business_basics",
      "yes",
      "",
      "",
      "business-basics",
      "primary_contact_name_role",
    ]),
    buildCsvLine([
      "Business basics",
      "",
      "Best contact email",
      "email",
      "business_basics",
      "yes",
      "",
      "",
      "",
      "best_contact_email",
    ]),
    buildCsvLine([
      "Offer and conversion flow",
      "Clarify the initial offer and conversion path.",
      "What product or service are we advertising first?",
      "long",
      "offer",
      "yes",
      "",
      "",
      "",
      "advertised_product",
    ]),
    buildCsvLine([
      "Ad assets",
      "Share available creative assets and landing pages.",
      "Which assets are ready to use?",
      "multi",
      "creative_strategy",
      "no",
      "",
      "Logo|Brand guidelines|Product images|Product videos|UGC|Landing page",
      "",
      "ready_assets",
    ]),
  ];

  return `${lines.join("\n")}\n`;
}
