import "server-only";

import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";

const nullableId = z.string().uuid().nullable();
const nullableDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

export const AiTaskDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000),
  client_id: nullableId,
  assignee_id: nullableId,
  parent_task_id: nullableId,
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  start_date: nullableDate,
  due_date: nullableDate,
});

export type AiTaskDraft = z.infer<typeof AiTaskDraftSchema>;

export type TaskParsingContext = {
  instruction: string;
  today: string;
  tomorrow: string;
  currentUserId: string;
  currentClientId: string;
  currentListId: string;
  members: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
  lists: Array<{ id: string; client_id: string; name: string; kind: string }>;
  tasks: Array<{ id: string; client_id: string; title: string }>;
};

type TaskParserSettings = {
  provider: "openai";
  model: string;
  apiKey: string;
  taskPrompt: string;
};

type OpenAiResponse = {
  error?: { message?: string };
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

const taskJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "client_id",
    "assignee_id",
    "parent_task_id",
    "status",
    "priority",
    "start_date",
    "due_date",
  ],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    client_id: { type: ["string", "null"] },
    assignee_id: { type: ["string", "null"] },
    parent_task_id: { type: ["string", "null"] },
    status: { type: "string", enum: [...TASK_STATUSES] },
    priority: { type: "string", enum: [...TASK_PRIORITIES] },
    start_date: { type: ["string", "null"] },
    due_date: { type: ["string", "null"] },
  },
} as const;

export async function parseTaskWithOpenAi({
  apiKey,
  model,
  taskPrompt,
  context,
}: {
  apiKey: string;
  model: string;
  taskPrompt: string;
  context: TaskParsingContext;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: taskPrompt,
        },
        {
          role: "user",
          content: JSON.stringify(context),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "agency_crm_task",
          strict: true,
          schema: taskJsonSchema,
        },
      },
      max_output_tokens: 3500,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const payload = await response.json() as OpenAiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI request failed with status ${response.status}.`);
  }
  const outputText = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text")
    ?.text;
  if (!outputText) throw new Error("OpenAI returned no structured task data.");

  return AiTaskDraftSchema.parse(JSON.parse(outputText));
}

export async function parseTaskInstruction({
  settings,
  context,
}: {
  settings: TaskParserSettings;
  context: TaskParsingContext;
}) {
  switch (settings.provider) {
    case "openai":
      return parseTaskWithOpenAi({
        apiKey: settings.apiKey,
        model: settings.model,
        taskPrompt: settings.taskPrompt,
        context,
      });
  }
}
