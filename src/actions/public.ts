"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOSSIER_SECTIONS } from "@/lib/constants";

export async function submitOnboarding(formData: FormData) {
  const token = z.string().uuid().parse(formData.get("token"));
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("onboarding_links")
    .select("id, agency_id, client_id, active, expires_at")
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();

  if (!link || (link.expires_at && new Date(link.expires_at) < new Date())) {
    throw new Error("This onboarding link is invalid or expired.");
  }

  const submission = Object.fromEntries(
    [...DOSSIER_SECTIONS, "knowledge_base"].map((field) => {
      const value = String(formData.get(field) ?? "").trim();
      return [field, field === "knowledge_base" ? value : { notes: value }];
    }),
  );
  const { data, error } = await admin
    .from("onboarding_submissions")
    .upsert(
      {
        agency_id: link.agency_id,
        client_id: link.client_id,
        onboarding_link_id: link.id,
        submission,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "onboarding_link_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logActivity(admin, {
    agencyId: link.agency_id,
    clientId: link.client_id,
    action: "onboarding_submission.received",
    entityType: "onboarding_submission",
    entityId: data.id,
  });
  redirect(`/onboarding/${token}?submitted=1`);
}

export async function updateCreatorAssignment(formData: FormData) {
  const token = z.string().uuid().parse(formData.get("token"));
  const assignmentId = z.string().uuid().parse(formData.get("assignment_id"));
  const completedUrl = String(formData.get("completed_drive_folder_url") ?? "").trim() || null;
  const comments = String(formData.get("comments") ?? "").trim() || null;
  const admin = createAdminClient();

  const { data: creator } = await admin
    .from("external_creators")
    .select("id, agency_id")
    .eq("portal_token", token)
    .eq("active", true)
    .maybeSingle();
  if (!creator) throw new Error("Creator portal is invalid or inactive.");

  const { data: assignment } = await admin
    .from("creative_assignments")
    .select("id, creative_request_id")
    .eq("id", assignmentId)
    .eq("creator_id", creator.id)
    .eq("agency_id", creator.agency_id)
    .maybeSingle();
  if (!assignment) throw new Error("Assignment not found.");

  const { data: request } = await admin
    .from("creative_requests")
    .select("client_id")
    .eq("id", assignment.creative_request_id)
    .eq("agency_id", creator.agency_id)
    .maybeSingle();

  const { error } = await admin
    .from("creative_assignments")
    .update({
      completed_drive_folder_url: completedUrl,
      comments,
      status: completedUrl ? "review" : "in_progress",
      submitted_at: completedUrl ? new Date().toISOString() : null,
    })
    .eq("id", assignmentId)
    .eq("creator_id", creator.id);
  if (error) throw new Error(error.message);

  await logActivity(admin, {
    agencyId: creator.agency_id,
    clientId: request?.client_id,
    action: completedUrl ? "creative_assignment.submitted" : "creative_assignment.updated",
    entityType: "creative_assignment",
    entityId: assignmentId,
  });
  revalidatePath(`/creator/${token}`);
}
