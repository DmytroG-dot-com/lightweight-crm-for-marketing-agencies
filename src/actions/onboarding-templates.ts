"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAgency } from "@/lib/auth";
import { sanitizeOnboardingTemplateSchema } from "@/lib/onboarding";

type OnboardingTemplateActionResult =
  | { ok: true; message: string; templateId?: string }
  | { ok: false; error: string };

function optionalString(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim() || null;
}

export async function saveOnboardingTemplate(formData: FormData): Promise<OnboardingTemplateActionResult> {
  const context = await requireAgency();

  try {
    const templateIdRaw = String(formData.get("template_id") ?? "").trim();
    const templateId = templateIdRaw ? z.string().uuid().parse(templateIdRaw) : null;
    const name = z.string().trim().min(1).max(180).parse(formData.get("name"));
    const description = optionalString(formData, "description");
    const schemaInput = String(formData.get("schema") ?? "").trim();
    const isDefault = formData.get("is_default") === "on";

    let parsedSchema: unknown;
    try {
      parsedSchema = JSON.parse(schemaInput);
    } catch {
      return { ok: false, error: "Template schema is invalid." };
    }

    const schema = sanitizeOnboardingTemplateSchema(parsedSchema);

    if (isDefault) {
      const clearDefaultQuery = context.supabase
        .from("onboarding_templates")
        .update({ is_default: false })
        .eq("agency_id", context.agency.id);

      const { error: clearDefaultError } = templateId
        ? await clearDefaultQuery.neq("id", templateId)
        : await clearDefaultQuery;
      if (clearDefaultError) throw new Error(clearDefaultError.message);
    }

    if (templateId) {
      const { error } = await context.supabase
        .from("onboarding_templates")
        .update({
          name,
          description,
          schema,
          is_default: isDefault,
        })
        .eq("id", templateId)
        .eq("agency_id", context.agency.id);
      if (error) throw new Error(error.message);

      await logActivity(context.supabase, {
        agencyId: context.agency.id,
        actorId: context.user.id,
        action: "onboarding_template.updated",
        entityType: "onboarding_template",
        entityId: templateId,
        metadata: { name, is_default: isDefault },
      });
      revalidatePath("/settings");

      return {
        ok: true,
        message: `Saved "${name}".`,
        templateId,
      };
    }

    const { data: template, error } = await context.supabase
      .from("onboarding_templates")
      .insert({
        agency_id: context.agency.id,
        name,
        description,
        schema,
        is_default: isDefault,
        created_by: context.user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logActivity(context.supabase, {
      agencyId: context.agency.id,
      actorId: context.user.id,
      action: "onboarding_template.created",
      entityType: "onboarding_template",
      entityId: template.id,
      metadata: { name, is_default: isDefault },
    });
    revalidatePath("/settings");

    return {
      ok: true,
      message: `Created "${name}".`,
      templateId: template.id,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save onboarding template.",
    };
  }
}

export async function deleteOnboardingTemplate(formData: FormData): Promise<OnboardingTemplateActionResult> {
  const context = await requireAgency();

  try {
    const templateId = z.string().uuid().parse(formData.get("template_id"));
    const { data: template, error: templateError } = await context.supabase
      .from("onboarding_templates")
      .select("id, name")
      .eq("id", templateId)
      .eq("agency_id", context.agency.id)
      .maybeSingle();
    if (templateError) throw new Error(templateError.message);
    if (!template) return { ok: false, error: "Onboarding template not found." };

    const { error } = await context.supabase
      .from("onboarding_templates")
      .delete()
      .eq("id", templateId)
      .eq("agency_id", context.agency.id);
    if (error) throw new Error(error.message);

    await logActivity(context.supabase, {
      agencyId: context.agency.id,
      actorId: context.user.id,
      action: "onboarding_template.deleted",
      entityType: "onboarding_template",
      entityId: templateId,
      metadata: { name: template.name },
    });
    revalidatePath("/settings");

    return {
      ok: true,
      message: `Deleted "${template.name}".`,
      templateId,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete onboarding template.",
    };
  }
}
