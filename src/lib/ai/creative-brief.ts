import "server-only";

import { z } from "zod";
import type { AiRuntimeSettings } from "@/lib/ai/settings";
import { DEFAULT_CREATIVE_BRIEF_PROMPT } from "@/lib/ai/creative-brief-prompt";

const briefJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "objective",
    "persona_summary",
    "offer_summary",
    "angle",
    "primary_promise",
    "proof_points",
    "objections_to_handle",
    "hooks",
    "visual_direction",
    "mandatory_elements",
    "forbidden_claims",
    "deliverables",
    "cta",
    "notes_for_creator",
  ],
  properties: {
    objective: { type: "string" },
    persona_summary: { type: "string" },
    offer_summary: { type: "string" },
    angle: { type: "string" },
    primary_promise: { type: "string" },
    proof_points: { type: "array", items: { type: "string" } },
    objections_to_handle: { type: "array", items: { type: "string" } },
    hooks: { type: "array", items: { type: "string" } },
    visual_direction: { type: "string" },
    mandatory_elements: { type: "array", items: { type: "string" } },
    forbidden_claims: { type: "array", items: { type: "string" } },
    deliverables: { type: "array", items: { type: "string" } },
    cta: { type: "string" },
    notes_for_creator: { type: "string" },
  },
} as const;

type OpenAiResponse = {
  error?: { message?: string } | null;
  output?: Array<{
    content?: Array<{
      type?: string | null;
      text?: string | null;
    }> | null;
  }> | null;
  output_text?: string | null;
};

export const CreativeBriefSchema = z.object({
  objective: z.string().trim().min(1).max(1000),
  persona_summary: z.string().trim().min(1).max(1500),
  offer_summary: z.string().trim().min(1).max(1500),
  angle: z.string().trim().min(1).max(1500),
  primary_promise: z.string().trim().min(1).max(1500),
  proof_points: z.array(z.string().trim().min(1).max(400)).max(8),
  objections_to_handle: z.array(z.string().trim().min(1).max(400)).max(8),
  hooks: z.array(z.string().trim().min(1).max(300)).max(10),
  visual_direction: z.string().trim().min(1).max(2000),
  mandatory_elements: z.array(z.string().trim().min(1).max(300)).max(10),
  forbidden_claims: z.array(z.string().trim().min(1).max(300)).max(10),
  deliverables: z.array(z.string().trim().min(1).max(300)).max(10),
  cta: z.string().trim().min(1).max(500),
  notes_for_creator: z.string().trim().min(1).max(2000),
});

export type CreativeBrief = z.infer<typeof CreativeBriefSchema>;

export async function generateCreativeBriefWithAi({
  settings,
  context,
}: {
  settings: AiRuntimeSettings;
  context: unknown;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      input: [
        {
          role: "system",
          content: DEFAULT_CREATIVE_BRIEF_PROMPT,
        },
        {
          role: "user",
          content: JSON.stringify(context),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "agency_creative_brief",
          strict: true,
          schema: briefJsonSchema,
        },
      },
      max_output_tokens: 5000,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const payload = await response.json() as OpenAiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI request failed with status ${response.status}.`);
  }

  const outputText = payload.output_text?.trim() || payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")
    ?.text
    ?.trim();
  if (!outputText) throw new Error("OpenAI returned no creative brief.");

  return CreativeBriefSchema.parse(JSON.parse(outputText));
}

export function renderCreativeBrief(brief: CreativeBrief) {
  const sections = [
    ["Objective", brief.objective],
    ["ICP", brief.persona_summary],
    ["Offer", brief.offer_summary],
    ["Angle", brief.angle],
    ["Primary Promise", brief.primary_promise],
    ["Proof Points", brief.proof_points.map((item) => `- ${item}`).join("\n") || "—"],
    ["Objections To Handle", brief.objections_to_handle.map((item) => `- ${item}`).join("\n") || "—"],
    ["Hook Ideas", brief.hooks.map((item) => `- ${item}`).join("\n") || "—"],
    ["Visual Direction", brief.visual_direction],
    ["Mandatory Elements", brief.mandatory_elements.map((item) => `- ${item}`).join("\n") || "—"],
    ["Avoid / Forbidden Claims", brief.forbidden_claims.map((item) => `- ${item}`).join("\n") || "—"],
    ["Suggested Deliverables", brief.deliverables.map((item) => `- ${item}`).join("\n") || "—"],
    ["CTA", brief.cta],
    ["Notes For Creator", brief.notes_for_creator],
  ] as const;

  return sections
    .map(([title, content]) => `## ${title}\n${content}`.trim())
    .join("\n\n")
    .trim();
}
