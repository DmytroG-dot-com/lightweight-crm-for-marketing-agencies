import "server-only";

import { decryptSecret } from "@/lib/ai/crypto";
import { DEFAULT_TASK_PROMPT } from "@/lib/ai/task-prompt";
import { createAdminClient } from "@/lib/supabase/admin";

export type AiRuntimeSettings = {
  provider: "openai";
  model: string;
  imageModel: string;
  apiKey: string;
  taskPrompt: string;
};

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1";

type AiSettingsWithPrompt = {
  model: string;
  image_model: string | null;
  enabled: boolean;
  encrypted_api_key: string | null;
  task_prompt: string | null;
};

export function isMissingAiSettingsColumn(error: { code?: string; message?: string } | null) {
  return Boolean(
    error
    && (
      error.code === "42703"
      || error.code === "PGRST204"
      || error.message?.includes("agency_ai_settings.task_prompt")
      || error.message?.includes("agency_ai_settings.image_model")
    )
  );
}

async function getAiSettingsWithPrompt(agencyId: string) {
  const admin = createAdminClient();
  const current = await admin
    .from("agency_ai_settings")
    .select("model, image_model, enabled, encrypted_api_key, task_prompt")
    .eq("agency_id", agencyId)
    .maybeSingle();

  if (!current.error) {
    return {
      data: current.data as AiSettingsWithPrompt | null,
      taskPromptStorageReady: true,
      imageModelStorageReady: true,
    };
  }
  if (!isMissingAiSettingsColumn(current.error)) throw new Error(current.error.message);

  // Keeps rolling deployments usable until migration 0005 is applied.
  const legacy = await admin
    .from("agency_ai_settings")
    .select("model, enabled, encrypted_api_key")
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (legacy.error) throw new Error(legacy.error.message);

  return {
    data: legacy.data ? { ...legacy.data, image_model: null, task_prompt: null } as AiSettingsWithPrompt : null,
    taskPromptStorageReady: false,
    imageModelStorageReady: false,
  };
}

export async function getAgencyAiSettingsSummary(agencyId: string) {
  const { data } = await getAiSettingsWithPrompt(agencyId);

  const hasStoredKey = Boolean(data?.encrypted_api_key);
  const hasServerKey = Boolean(process.env.OPENAI_API_KEY);
  return {
    provider: "openai" as const,
    model: data?.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    imageModel: data?.image_model ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL,
    enabled: data?.enabled ?? true,
    configured: hasStoredKey || hasServerKey,
    usesServerKey: !hasStoredKey && hasServerKey,
  };
}

export async function getAgencyAiSettingsForAdmin(agencyId: string) {
  const { data, taskPromptStorageReady, imageModelStorageReady } = await getAiSettingsWithPrompt(agencyId);

  const hasStoredKey = Boolean(data?.encrypted_api_key);
  const hasServerKey = Boolean(process.env.OPENAI_API_KEY);
  const customTaskPrompt = data?.task_prompt?.trim() || null;
  return {
    provider: "openai" as const,
    model: data?.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    imageModel: data?.image_model ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL,
    enabled: data?.enabled ?? true,
    configured: hasStoredKey || hasServerKey,
    usesServerKey: !hasStoredKey && hasServerKey,
    taskPrompt: customTaskPrompt ?? DEFAULT_TASK_PROMPT,
    taskPromptCustomized: Boolean(customTaskPrompt),
    taskPromptStorageReady,
    imageModelStorageReady,
  };
}

export async function getAgencyAiRuntimeSettings(agencyId: string): Promise<AiRuntimeSettings | null> {
  const { data } = await getAiSettingsWithPrompt(agencyId);
  if (data && !data.enabled) return null;

  const apiKey = data?.encrypted_api_key
    ? decryptSecret(data.encrypted_api_key)
    : process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return {
    provider: "openai",
    model: data?.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    imageModel: data?.image_model ?? process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL,
    apiKey,
    taskPrompt: data?.task_prompt?.trim() || DEFAULT_TASK_PROMPT,
  };
}
