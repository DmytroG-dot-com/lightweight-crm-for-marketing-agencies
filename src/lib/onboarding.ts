import { DOSSIER_SECTIONS } from "@/lib/constants";

export const ONBOARDING_QUESTION_TYPES = ["short", "long", "email", "url", "choice", "multi"] as const;
export type OnboardingQuestionType = (typeof ONBOARDING_QUESTION_TYPES)[number];

export const ONBOARDING_TARGETS = [...DOSSIER_SECTIONS, "knowledge_base", "none"] as const;
export type OnboardingQuestionTarget = (typeof ONBOARDING_TARGETS)[number];

export const DEFAULT_ONBOARDING_TEMPLATE_NAME = "Standard onboarding";

export type OnboardingQuestion = {
  key: string;
  target: OnboardingQuestionTarget;
  label: string;
  type: OnboardingQuestionType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

export type OnboardingGroup = {
  key: string;
  title: string;
  description: string;
  questions: OnboardingQuestion[];
};

export type OnboardingTemplateSchema = {
  version: 1;
  groups: OnboardingGroup[];
};

export type OnboardingDraftValue = string | string[];
export type OnboardingDraft = Record<string, OnboardingDraftValue>;

type CustomSubmissionField = {
  label: string;
  value: OnboardingDraftValue;
};

const QUESTION_TYPE_SET = new Set<string>(ONBOARDING_QUESTION_TYPES);
const TARGET_SET = new Set<string>(ONBOARDING_TARGETS);

export const ONBOARDING_GROUPS: OnboardingGroup[] = [
  {
    key: "business-basics",
    title: "Business basics",
    description: "Core contact and company information.",
    questions: [
      { key: "primary_contact_name_role", target: "business_basics", label: "Primary contact name and role", type: "short", required: true },
      { key: "best_contact_email", target: "business_basics", label: "Best contact email", type: "email", required: true },
      { key: "company_name", target: "business_basics", label: "Company name", type: "short", required: true },
      { key: "company_website", target: "business_basics", label: "Company website", type: "url", placeholder: "https://" },
    ],
  },
  {
    key: "business-overview",
    title: "Business overview",
    description: "Share what you offer and the goals that matter most.",
    questions: [
      { key: "business_description", target: "business_basics", label: "Briefly describe your business. What products or services do you offer?", type: "long", required: true },
      { key: "unique_difference", target: "messaging", label: "What makes your business unique or different from competitors?", type: "long", required: true },
      { key: "primary_business_goal", target: "creative_strategy", label: "What is your primary business goal right now?", type: "long", placeholder: "For example: leads, sales, subscriptions, retention, or brand awareness." },
    ],
  },
  {
    key: "target-audience",
    title: "Target audience",
    description: "Define who we should reach and where.",
    questions: [
      { key: "ideal_customer", target: "audience", label: "Who is your ideal customer?", type: "long", required: true, placeholder: "Include relevant demographics, roles, interests, behaviors, and customer types." },
      { key: "geographic_areas", target: "audience", label: "What geographic areas do you serve?", type: "long" },
      { key: "existing_personas_audience_insights", target: "audience", label: "Do you have existing customer personas or audience insights?", type: "long" },
    ],
  },
  {
    key: "offer-conversion",
    title: "Offer and conversion flow",
    description: "Clarify the initial offer and conversion path.",
    questions: [
      { key: "advertised_product", target: "offer", label: "What product or service are we advertising first?", type: "long", required: true },
      { key: "current_offer", target: "offer", label: "What is your current offer or promotion, if any?", type: "long" },
      { key: "customer_journey", target: "offer", label: "What is your typical customer journey from ad to sale?", type: "long", required: true },
    ],
  },
  {
    key: "ad-assets",
    title: "Ad assets",
    description: "Share available creative assets and landing pages.",
    questions: [
      {
        key: "ready_assets",
        target: "creative_strategy",
        label: "Which assets are ready to use?",
        type: "multi",
        options: ["Logo", "Brand guidelines", "Product images", "Product videos", "Raw footage", "UGC", "Testimonials", "Existing ads", "Landing page", "Email or SMS assets"],
      },
      { key: "campaign_landing_page", target: "offer", label: "Do you have a landing page for this campaign? If so, share the link.", type: "url", placeholder: "https://" },
      { key: "preferred_cta", target: "messaging", label: "What call to action should we use?", type: "long", placeholder: "For example: Book a call, start a trial, get a quote, or claim a discount." },
    ],
  },
  {
    key: "accounts-access",
    title: "Ad accounts and access",
    description: "Tell us which platforms are already in place. Never submit passwords, API keys, recovery codes, or other secrets.",
    questions: [
      {
        key: "available_platforms",
        target: "creative_strategy",
        label: "Which platforms do you already have?",
        type: "multi",
        options: ["Meta Business Manager", "Meta ad account", "Google Ads", "Microsoft Ads", "TikTok Ads", "LinkedIn Ads", "GA4", "Google Tag Manager", "Shopify", "CRM", "Email or SMS platform"],
      },
      { key: "safe_access_instructions", target: "creative_strategy", label: "How should our team request access or receive an invitation?", type: "long", placeholder: "Share invitation instructions or the correct contact. Do not include passwords or secret credentials." },
    ],
  },
  {
    key: "performance-history",
    title: "Performance history",
    description: "Provide context on past advertising performance and spend.",
    questions: [
      { key: "ads_run_before", target: "creative_strategy", label: "Have you run ads before?", type: "choice", options: ["Yes", "No", "Not sure"] },
      { key: "previous_platform_results", target: "proof", label: "If yes, which platforms did you use and what results did you see?", type: "long" },
      { key: "monthly_ad_spend", target: "creative_strategy", label: "What is your current monthly ad spend, or what are you comfortable starting with?", type: "short" },
    ],
  },
  {
    key: "budget-expectations",
    title: "Budget and expectations",
    description: "Align on initial goals and performance metrics.",
    questions: [
      { key: "first_90_day_goals", target: "creative_strategy", label: "What are your goals in the first 90 days?", type: "long", required: true },
      { key: "priority_kpis", target: "creative_strategy", label: "Which KPIs are you tracking or would like us to focus on?", type: "long", placeholder: "For example: CPA, CPL, ROAS, conversion rate, LTV, or retention." },
    ],
  },
  {
    key: "competitors-inspiration",
    title: "Competitors and inspiration",
    description: "Share references and inspiration.",
    questions: [
      { key: "top_competitors", target: "competitors", label: "Who are your top three competitors?", type: "long" },
      { key: "admired_brands", target: "competitors", label: "Which brands do you admire for their advertising or branding?", type: "long" },
    ],
  },
  {
    key: "legal-compliance",
    title: "Legal and compliance",
    description: "Note any restrictions or required disclosures.",
    questions: [
      { key: "compliance_requirements", target: "messaging", label: "Are there any disclaimers, privacy policies, or compliance requirements we need to include?", type: "long" },
    ],
  },
  {
    key: "miscellaneous",
    title: "Miscellaneous",
    description: "Anything else that helps us plan the launch.",
    questions: [
      { key: "deadlines_launches_events", target: "creative_strategy", label: "Are there any deadlines, launches, or events coming up?", type: "long" },
      { key: "additional_context", target: "knowledge_base", label: "Anything else we should know before we get started?", type: "long" },
    ],
  },
];

export const DEFAULT_ONBOARDING_TEMPLATE_SCHEMA: OnboardingTemplateSchema = {
  version: 1,
  groups: ONBOARDING_GROUPS,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((item) => normalizedString(item)).filter(Boolean));
}

function answerLength(value: OnboardingDraftValue) {
  return Array.isArray(value) ? value.join("").length : value.length;
}

function isAnswerEmpty(value: OnboardingDraftValue) {
  return Array.isArray(value) ? value.length === 0 : value.length === 0;
}

function answerToText(value: OnboardingDraftValue) {
  return Array.isArray(value) ? value.join("\n") : value;
}

function slugifyKey(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function uniqueKey(base: string, seen: Set<string>) {
  let candidate = base;
  let counter = 2;

  while (seen.has(candidate)) {
    candidate = `${base}_${counter}`;
    counter += 1;
  }

  seen.add(candidate);
  return candidate;
}

function normalizeQuestionType(value: unknown): OnboardingQuestionType {
  const type = normalizedString(value);
  if (!QUESTION_TYPE_SET.has(type)) {
    throw new Error(`Invalid onboarding question type: ${type || "missing"}.`);
  }
  return type as OnboardingQuestionType;
}

function normalizeQuestionTarget(value: unknown): OnboardingQuestionTarget {
  const target = normalizedString(value);
  if (!target) return "none";
  if (!TARGET_SET.has(target)) {
    throw new Error(`Invalid onboarding question target: ${target}.`);
  }
  return target as OnboardingQuestionTarget;
}

export function cloneOnboardingTemplateSchema(schema: OnboardingTemplateSchema) {
  return JSON.parse(JSON.stringify(schema)) as OnboardingTemplateSchema;
}

export function createBlankOnboardingTemplateSchema(): OnboardingTemplateSchema {
  return {
    version: 1,
    groups: [],
  };
}

export function listOnboardingQuestions(schema: OnboardingTemplateSchema) {
  return schema.groups.flatMap((group) => group.questions);
}

export function onboardingTemplateSchemaOrDefault(input: unknown) {
  try {
    return sanitizeOnboardingTemplateSchema(input);
  } catch {
    return cloneOnboardingTemplateSchema(DEFAULT_ONBOARDING_TEMPLATE_SCHEMA);
  }
}

export function sanitizeOnboardingTemplateSchema(input: unknown): OnboardingTemplateSchema {
  if (!isRecord(input)) {
    throw new Error("Invalid onboarding template.");
  }

  const rawGroups = Array.isArray(input.groups) ? input.groups : [];
  if (!rawGroups.length) {
    throw new Error("Add at least one onboarding section.");
  }
  if (rawGroups.length > 24) {
    throw new Error("Onboarding templates support up to 24 sections.");
  }

  const groupKeys = new Set<string>();
  const questionKeys = new Set<string>();
  let totalQuestions = 0;

  const groups = rawGroups.map((rawGroup, groupIndex) => {
    if (!isRecord(rawGroup)) {
      throw new Error("Invalid onboarding section.");
    }

    const title = normalizedString(rawGroup.title);
    if (!title) {
      throw new Error(`Section ${groupIndex + 1} needs a title.`);
    }
    if (title.length > 120) {
      throw new Error(`Section "${title}" is too long.`);
    }

    const description = normalizedString(rawGroup.description).slice(0, 500);
    const questionsInput = Array.isArray(rawGroup.questions) ? rawGroup.questions : [];
    if (!questionsInput.length) {
      throw new Error(`Section "${title}" needs at least one question.`);
    }

    const key = uniqueKey(
      slugifyKey(normalizedString(rawGroup.key) || title, `section_${groupIndex + 1}`),
      groupKeys,
    );

    const questions = questionsInput.map((rawQuestion, questionIndex) => {
      if (!isRecord(rawQuestion)) {
        throw new Error(`Section "${title}" contains an invalid question.`);
      }

      const label = normalizedString(rawQuestion.label);
      if (!label) {
        throw new Error(`Question ${questionIndex + 1} in "${title}" needs a label.`);
      }
      if (label.length > 200) {
        throw new Error(`Question "${label}" is too long.`);
      }

      const type = normalizeQuestionType(rawQuestion.type);
      const target = normalizeQuestionTarget(rawQuestion.target);
      const placeholder = normalizedString(rawQuestion.placeholder).slice(0, 500) || undefined;
      const required = Boolean(rawQuestion.required);
      const keyBase = normalizedString(rawQuestion.key) || label;
      const questionKey = uniqueKey(
        slugifyKey(keyBase, `question_${groupIndex + 1}_${questionIndex + 1}`),
        questionKeys,
      );
      const options = type === "choice" || type === "multi"
        ? stringArray(rawQuestion.options).slice(0, 50)
        : undefined;

      if ((type === "choice" || type === "multi") && (!options || options.length === 0)) {
        throw new Error(`Question "${label}" needs at least one option.`);
      }

      totalQuestions += 1;
      if (totalQuestions > 250) {
        throw new Error("Onboarding templates support up to 250 questions.");
      }

      return {
        key: questionKey,
        target,
        label,
        type,
        required,
        placeholder,
        options,
      } satisfies OnboardingQuestion;
    });

    return {
      key,
      title,
      description,
      questions,
    } satisfies OnboardingGroup;
  });

  return {
    version: 1,
    groups,
  };
}

export function sanitizeOnboardingDraft(
  input: unknown,
  schema: OnboardingTemplateSchema = DEFAULT_ONBOARDING_TEMPLATE_SCHEMA,
): OnboardingDraft {
  if (!isRecord(input)) {
    throw new Error("Invalid onboarding draft.");
  }

  const source = input as Record<string, unknown>;
  const draft: OnboardingDraft = {};
  let totalLength = 0;

  for (const question of listOnboardingQuestions(schema)) {
    const rawValue = source[question.key];
    const value = question.type === "multi"
      ? Array.isArray(rawValue)
        ? rawValue
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => question.options?.includes(item))
        : []
      : typeof rawValue === "string"
        ? question.type === "choice" && question.options?.length
          ? question.options.includes(rawValue) ? rawValue : ""
          : rawValue
        : "";

    const length = answerLength(value);
    if (length > 50_000) throw new Error(`Answer is too long: ${question.label}`);
    totalLength += length;
    draft[question.key] = value;
  }

  if (totalLength > 500_000) throw new Error("Onboarding draft is too large.");
  return draft;
}

export function buildOnboardingDraft(
  formData: FormData,
  schema: OnboardingTemplateSchema = DEFAULT_ONBOARDING_TEMPLATE_SCHEMA,
) {
  const answers = Object.fromEntries(
    listOnboardingQuestions(schema).map((question) => [
      question.key,
      question.type === "multi"
        ? formData.getAll(question.key).map(String)
        : String(formData.get(question.key) ?? ""),
    ]),
  );

  return sanitizeOnboardingDraft(answers, schema);
}

function knowledgeBaseDraftFromSubmission(
  value: unknown,
  questions: OnboardingQuestion[],
) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || questions.length === 0) return {};
  if (questions.length === 1) return { [questions[0].key]: text };

  const questionsByLabel = new Map<string, OnboardingQuestion[]>();
  for (const question of questions) {
    questionsByLabel.set(question.label, [
      ...(questionsByLabel.get(question.label) ?? []),
      question,
    ]);
  }

  const headings = Array.from(text.matchAll(/^### (.+)\r?\n\r?\n/gm)).flatMap((match) => {
    const matchingQuestions = questionsByLabel.get(match[1]);
    const question = matchingQuestions?.shift();
    return question && match.index !== undefined ? [{ match, question, index: match.index }] : [];
  });

  if (headings.length === 0) {
    // Older submissions omitted headings when only one knowledge-base answer was supplied.
    return { [questions[0].key]: text };
  }

  return Object.fromEntries(headings.map((heading, index) => {
    const answerStart = heading.index + heading.match[0].length;
    const answerEnd = headings[index + 1]?.index ?? text.length;
    return [heading.question.key, text.slice(answerStart, answerEnd).trim()];
  }));
}

export function onboardingDraftFromSubmission(
  input: unknown,
  schema: OnboardingTemplateSchema = DEFAULT_ONBOARDING_TEMPLATE_SCHEMA,
) {
  if (!isRecord(input)) return sanitizeOnboardingDraft({}, schema);

  const answers: Record<string, unknown> = {};
  const knowledgeBaseQuestions = listOnboardingQuestions(schema).filter(
    (question) => question.target === "knowledge_base",
  );
  Object.assign(
    answers,
    knowledgeBaseDraftFromSubmission(input.knowledge_base, knowledgeBaseQuestions),
  );

  for (const question of listOnboardingQuestions(schema)) {
    if (question.target === "knowledge_base") continue;

    if (question.target === "none") {
      const customFields = isRecord(input.custom_fields) ? input.custom_fields : {};
      const field = customFields[question.key];
      answers[question.key] = isRecord(field) ? field.value : undefined;
      continue;
    }

    const section = input[question.target];
    answers[question.key] = isRecord(section) ? section[question.key] : undefined;
  }

  return sanitizeOnboardingDraft(answers, schema);
}

function formatKnowledgeBaseEntries(entries: Array<{ label: string; value: OnboardingDraftValue }>) {
  if (!entries.length) return "";
  if (entries.length === 1) return answerToText(entries[0].value).trim();

  return entries
    .map((entry) => `### ${entry.label}\n\n${answerToText(entry.value).trim()}`)
    .join("\n\n")
    .trim();
}

export function formatOnboardingCustomFields(customFields: unknown) {
  if (!isRecord(customFields)) return "";

  const entries = Object.values(customFields).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const label = normalizedString(entry.label);
    const rawValue = entry.value;
    const value = Array.isArray(rawValue)
      ? rawValue.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : typeof rawValue === "string"
        ? rawValue.trim()
        : "";

    if (!label || isAnswerEmpty(value)) return [];
    return [{ label, value }] satisfies CustomSubmissionField[];
  });

  if (!entries.length) return "";

  return [
    "## Custom onboarding answers",
    "",
    ...entries.flatMap((entry) => [
      `### ${entry.label}`,
      "",
      answerToText(entry.value).trim(),
      "",
    ]),
  ].join("\n").trim();
}

export function buildOnboardingSubmission(
  formData: FormData,
  schema: OnboardingTemplateSchema = DEFAULT_ONBOARDING_TEMPLATE_SCHEMA,
) {
  const submission: Record<string, unknown> = Object.fromEntries(
    DOSSIER_SECTIONS.map((section) => [section, {}]),
  );
  const knowledgeBaseEntries: Array<{ label: string; value: OnboardingDraftValue }> = [];
  const customFields: Record<string, CustomSubmissionField> = {};
  let totalLength = 0;

  for (const question of listOnboardingQuestions(schema)) {
    const value = question.type === "multi"
      ? formData.getAll(question.key)
        .map((item) => String(item).trim())
        .filter((item) => question.options?.includes(item))
      : (() => {
        const raw = String(formData.get(question.key) ?? "").trim();
        if (question.type === "choice" && question.options?.length) {
          return question.options.includes(raw) ? raw : "";
        }
        return raw;
      })();

    const length = answerLength(value);
    if (length > 50_000) throw new Error(`Answer is too long: ${question.label}`);
    if (question.required && isAnswerEmpty(value)) {
      throw new Error(`Required answer missing: ${question.label}`);
    }

    totalLength += length;
    if (isAnswerEmpty(value)) continue;

    if (question.target === "knowledge_base") {
      knowledgeBaseEntries.push({ label: question.label, value });
      continue;
    }

    if (question.target === "none") {
      customFields[question.key] = {
        label: question.label,
        value,
      };
      continue;
    }

    (submission[question.target] as Record<string, unknown>)[question.key] = value;
  }

  if (totalLength > 500_000) throw new Error("Onboarding submission is too large.");

  submission.knowledge_base = formatKnowledgeBaseEntries(knowledgeBaseEntries);
  if (Object.keys(customFields).length > 0) {
    submission.custom_fields = customFields;
  }

  return submission;
}
