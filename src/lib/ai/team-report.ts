import "server-only";

import { z } from "zod";
import type { AiRuntimeSettings } from "@/lib/ai/settings";

const ReportItemSchema = z.object({
  title: z.string().trim().min(1).max(140),
  detail: z.string().trim().min(1).max(800),
  client_ids: z.array(z.string().uuid()).max(5),
  task_ids: z.array(z.string().uuid()).max(8),
});

export const AiTeamReportSchema = z.object({
  executive_summary: z.string().trim().min(1).max(2000),
  wins: z.array(ReportItemSchema).max(6),
  risks: z.array(ReportItemSchema).max(6),
  recommendations: z.array(ReportItemSchema).max(6),
});

export type AiTeamReport = z.infer<typeof AiTeamReportSchema>;

type OpenAiResponse = {
  error?: { message?: string };
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

const itemJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "detail", "client_ids", "task_ids"],
  properties: {
    title: { type: "string" },
    detail: { type: "string" },
    client_ids: { type: "array", items: { type: "string" } },
    task_ids: { type: "array", items: { type: "string" } },
  },
} as const;

const reportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["executive_summary", "wins", "risks", "recommendations"],
  properties: {
    executive_summary: { type: "string" },
    wins: { type: "array", items: itemJsonSchema },
    risks: { type: "array", items: itemJsonSchema },
    recommendations: { type: "array", items: itemJsonSchema },
  },
} as const;

export async function generateTeamReportWithAi({
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
          content: [
            "You are an agency operations director writing a concise management report.",
            "Use only the supplied CRM data. Never invent facts, task IDs, client IDs, causes, or performance claims.",
            "Metrics are authoritative. Explain what matters, identify workload or delivery risks, and recommend concrete management actions.",
            "Respect metric_definitions: open and overdue work are current snapshots, while completed tasks, comments, and activity are bounded to the selected reporting period.",
            "Every evidence ID must exactly match an ID present in the supplied data. Leave evidence arrays empty when no exact supporting record exists.",
            "Keep the executive summary brief and each section focused on high-signal items.",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(context) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "agency_team_report",
          strict: true,
          schema: reportJsonSchema,
        },
      },
      max_output_tokens: 4500,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const payload = await response.json() as OpenAiResponse;
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI request failed with status ${response.status}.`);
  const outputText = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")
    ?.text;
  if (!outputText) throw new Error("OpenAI returned no team report.");
  return AiTeamReportSchema.parse(JSON.parse(outputText));
}
