import "server-only";

import { z } from "zod";
import { MAX_GENERATED_CREATIVE_IMAGES } from "@/lib/creative/constants";
import { DEFAULT_OPENAI_IMAGE_MODEL } from "@/lib/ai/settings";

export const CREATIVE_IMAGE_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;
export const CREATIVE_IMAGE_QUALITIES = ["low", "medium", "high"] as const;
export { MAX_GENERATED_CREATIVE_IMAGES };

const creativeImageResponseSchema = z.object({
  error: z.object({ message: z.string().optional() }).nullish(),
  data: z.array(z.object({
    b64_json: z.string().optional(),
    revised_prompt: z.string().nullish(),
  })).nullish(),
});

export type CreativeImageSize = (typeof CREATIVE_IMAGE_SIZES)[number];
export type CreativeImageQuality = (typeof CREATIVE_IMAGE_QUALITIES)[number];

export type GeneratedCreativeImage = {
  dataUrl: string;
  filename: string;
  revisedPrompt: string | null;
  size: CreativeImageSize;
};

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringList(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function labeledLine(label: string, value: string | null) {
  return value ? `${label}: ${value}` : null;
}

export function buildCreativeImagePrompt({
  title,
  hypothesis,
  brief,
  briefJson,
  notes,
  personaName,
  personaSummary,
}: {
  title: string;
  hypothesis: string | null;
  brief: string | null;
  briefJson: unknown;
  notes: string | null;
  personaName: string | null;
  personaSummary: string | null;
}) {
  const structuredBrief = briefJson && typeof briefJson === "object"
    ? briefJson as Record<string, unknown>
    : null;

  const promptSections = [
    "Create a polished direct-response marketing image concept for internal creative testing.",
    "Return a single clean ad-style visual with strong composition, clear focal point, realistic lighting, and platform-native styling.",
    "Do not add watermarks, frames, UI chrome, mockup borders, collage layouts, or dense unreadable text.",
    "If text appears in the composition, keep it minimal and legible.",
    `Creative request: ${title}`,
    labeledLine("Direction", hypothesis),
    labeledLine("Audience label", personaName),
    labeledLine("Audience summary", personaSummary),
    structuredBrief ? labeledLine("Objective", stringValue(structuredBrief, "objective")) : null,
    structuredBrief ? labeledLine("Offer", stringValue(structuredBrief, "offer_summary")) : null,
    structuredBrief ? labeledLine("Angle", stringValue(structuredBrief, "angle")) : null,
    structuredBrief ? labeledLine("Primary promise", stringValue(structuredBrief, "primary_promise")) : null,
    structuredBrief ? labeledLine("Visual direction", stringValue(structuredBrief, "visual_direction")) : null,
    structuredBrief ? labeledLine("Notes for creator", stringValue(structuredBrief, "notes_for_creator")) : null,
    structuredBrief
      ? (() => {
        const hooks = stringList(structuredBrief, "hooks").slice(0, 3);
        return hooks.length ? `Hook cues: ${hooks.join("; ")}` : null;
      })()
      : null,
    structuredBrief
      ? (() => {
        const elements = stringList(structuredBrief, "mandatory_elements").slice(0, 6);
        return elements.length ? `Mandatory elements: ${elements.join("; ")}` : null;
      })()
      : null,
    structuredBrief
      ? (() => {
        const forbiddenClaims = stringList(structuredBrief, "forbidden_claims").slice(0, 6);
        return forbiddenClaims.length ? `Avoid these claims or ideas: ${forbiddenClaims.join("; ")}` : null;
      })()
      : null,
    !structuredBrief && brief ? `Creative brief:\n${brief}` : null,
    notes ? `Additional notes: ${notes}` : null,
  ];

  return promptSections.filter(Boolean).join("\n\n");
}

export async function generateCreativeImagesWithAi({
  apiKey,
  model,
  prompt,
  count,
  size,
  quality,
  filenamePrefix,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  count: number;
  size: CreativeImageSize;
  quality: CreativeImageQuality;
  filenamePrefix: string;
}) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || DEFAULT_OPENAI_IMAGE_MODEL,
      prompt,
      n: count,
      size,
      quality,
      output_format: "webp",
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const payload = creativeImageResponseSchema.parse(await response.json());
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI image request failed with status ${response.status}.`);
  }

  const images = (payload.data ?? [])
    .map((item, index) => {
      if (!item.b64_json) return null;
      return {
        dataUrl: `data:image/webp;base64,${item.b64_json}`,
        filename: `${filenamePrefix}-${index + 1}.webp`,
        revisedPrompt: item.revised_prompt ?? null,
        size,
      } satisfies GeneratedCreativeImage;
    })
    .filter((item): item is GeneratedCreativeImage => Boolean(item));

  if (!images.length) throw new Error("OpenAI returned no images.");
  return images;
}
