export const TASK_STATUSES = ["todo", "in_progress", "review", "blocked", "complete"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const CREATIVE_STATUSES = ["draft", "in_progress", "review", "approved", "launched", "stopped"] as const;

export const DOSSIER_SECTIONS = [
  "business_basics",
  "audience",
  "offer",
  "competitors",
  "proof",
  "founder_story",
  "pricing",
  "creative_strategy",
  "messaging",
] as const;

export const DOSSIER_LABELS: Record<(typeof DOSSIER_SECTIONS)[number], string> = {
  business_basics: "Business basics",
  audience: "Audience",
  offer: "Offer",
  competitors: "Competitors",
  proof: "Proof",
  founder_story: "Founder story",
  pricing: "Pricing",
  creative_strategy: "Creative strategy",
  messaging: "Messaging",
};
