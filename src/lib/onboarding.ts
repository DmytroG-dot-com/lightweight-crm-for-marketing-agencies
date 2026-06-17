import { DOSSIER_SECTIONS } from "@/lib/constants";

type DossierSection = (typeof DOSSIER_SECTIONS)[number];
type QuestionType = "short" | "long" | "email" | "url" | "choice" | "multi";

export type OnboardingQuestion = {
  key: string;
  target: DossierSection | "knowledge_base";
  label: string;
  type: QuestionType;
  required?: boolean;
  placeholder?: string;
  options?: readonly string[];
};

export type OnboardingGroup = {
  key: string;
  title: string;
  description: string;
  questions: readonly OnboardingQuestion[];
};

export type OnboardingDraftValue = string | string[];
export type OnboardingDraft = Record<string, OnboardingDraftValue>;

export const ONBOARDING_GROUPS: readonly OnboardingGroup[] = [
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
] as const;

export function sanitizeOnboardingDraft(input: unknown): OnboardingDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid onboarding draft.");
  }

  const source = input as Record<string, unknown>;
  const draft: OnboardingDraft = {};
  let totalLength = 0;

  for (const group of ONBOARDING_GROUPS) {
    for (const question of group.questions) {
      const rawValue = source[question.key];
      const value = question.type === "multi"
        ? Array.isArray(rawValue)
          ? rawValue
            .filter((item): item is string => typeof item === "string")
            .filter((item) => question.options?.includes(item))
          : []
        : typeof rawValue === "string"
          ? rawValue
          : "";
      const length = Array.isArray(value) ? value.join("").length : value.length;
      if (length > 50_000) throw new Error(`Answer is too long: ${question.label}`);
      totalLength += length;
      draft[question.key] = value;
    }
  }

  if (totalLength > 500_000) throw new Error("Onboarding draft is too large.");
  return draft;
}

export function buildOnboardingSubmission(formData: FormData) {
  const submission: Record<string, unknown> = Object.fromEntries(
    DOSSIER_SECTIONS.map((section) => [section, {}]),
  );
  let knowledgeBase = "";
  let totalLength = 0;

  for (const group of ONBOARDING_GROUPS) {
    for (const question of group.questions) {
      const value = question.type === "multi"
        ? formData.getAll(question.key)
          .map((item) => String(item).trim())
          .filter((item) => question.options?.includes(item))
        : String(formData.get(question.key) ?? "").trim();
      const length = Array.isArray(value) ? value.join("").length : value.length;
      if (length > 50_000) throw new Error(`Answer is too long: ${question.label}`);
      if (question.required && (Array.isArray(value) ? !value.length : !value)) {
        throw new Error(`Required answer missing: ${question.label}`);
      }
      totalLength += length;

      if (question.target === "knowledge_base") {
        knowledgeBase = Array.isArray(value) ? value.join(", ") : value;
      } else {
        (submission[question.target] as Record<string, unknown>)[question.key] = value;
      }
    }
  }
  if (totalLength > 500_000) throw new Error("Onboarding submission is too large.");
  submission.knowledge_base = knowledgeBase;
  return submission;
}
