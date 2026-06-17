"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { CREATIVE_STATUSES } from "@/lib/constants";
import { buildOnboardingSubmission, sanitizeOnboardingDraft } from "@/lib/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";

function relatedClientStatus(value: unknown) {
  const client = Array.isArray(value) ? value[0] : value;
  return client && typeof client === "object" && "status" in client
    ? String(client.status)
    : null;
}

type CreativeStatus = (typeof CREATIVE_STATUSES)[number];

function statusAfterCreatorAssigned(status: string): CreativeStatus {
  return status === "draft" || status === "ready" || status === "assigned"
    ? "in_progress"
    : status as CreativeStatus;
}

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

  const submission = buildOnboardingSubmission(formData);
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
  await admin
    .from("onboarding_links")
    .update({ draft: {}, draft_updated_at: null })
    .eq("id", link.id);
  redirect(`/onboarding/${token}?submitted=1`);
}

export async function saveOnboardingDraft(tokenInput: string, input: unknown) {
  const token = z.string().uuid().parse(tokenInput);
  const draft = sanitizeOnboardingDraft(input);
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("onboarding_links")
    .select("id, active, expires_at")
    .eq("token", token)
    .eq("active", true)
    .maybeSingle();

  if (!link || (link.expires_at && new Date(link.expires_at) < new Date())) {
    throw new Error("This onboarding link is invalid or expired.");
  }

  const updatedAt = new Date().toISOString();
  const { error } = await admin
    .from("onboarding_links")
    .update({ draft, draft_updated_at: updatedAt })
    .eq("id", link.id);
  if (error) throw new Error(error.message);

  return { updatedAt };
}

export async function updateCreatorAssignment(formData: FormData) {
  const token = z.string().uuid().parse(formData.get("token"));
  const requestId = z.string().uuid().parse(formData.get("request_id"));
  const completedUrl = String(formData.get("completed_drive_folder_url") ?? "").trim() || null;
  const commentBody = String(formData.get("comment_body") ?? "").trim();
  const admin = createAdminClient();

  const { data: creator } = await admin
    .from("external_creators")
    .select("id, agency_id, name")
    .eq("portal_token", token)
    .eq("active", true)
    .maybeSingle();
  if (!creator) throw new Error("Creator portal is invalid or inactive.");

  const { data: request } = await admin
    .from("creative_requests")
    .select("id, client_id, status, archived_at, completed_drive_folder_url, submitted_at, clients(status)")
    .eq("id", requestId)
    .eq("creator_id", creator.id)
    .eq("agency_id", creator.agency_id)
    .maybeSingle();
  if (!request) throw new Error("Creative request not found.");
  if (request.archived_at || relatedClientStatus(request.clients) === "archived") {
    throw new Error("This creative request is unavailable while the client workspace is archived.");
  }
  const submittedAt = completedUrl
    ? completedUrl === request.completed_drive_folder_url
      ? (request.submitted_at ?? new Date().toISOString())
      : new Date().toISOString()
    : null;

  const { error } = await admin
    .from("creative_requests")
    .update({
      completed_drive_folder_url: completedUrl,
      status: completedUrl
        ? "review"
        : statusAfterCreatorAssigned(request.status),
      submitted_at: submittedAt,
    })
    .eq("id", requestId)
    .eq("creator_id", creator.id);
  if (error) throw new Error(error.message);

  if (commentBody) {
    const { error: commentError } = await admin
      .from("creative_request_comments")
      .insert({
        agency_id: creator.agency_id,
        creative_request_id: requestId,
        author_type: "creator",
        author_name: creator.name,
        body: commentBody,
      });
    if (commentError) throw new Error(commentError.message);
  }

  await logActivity(admin, {
    agencyId: creator.agency_id,
    clientId: request?.client_id,
    action: completedUrl
      ? "creative_request.submitted"
      : commentBody
        ? "creative_request.commented_by_creator"
        : "creative_request.updated_by_creator",
    entityType: "creative_request",
    entityId: requestId,
  });
  revalidatePath("/creative-master");
  revalidatePath(`/clients/${request.client_id}`);
  revalidatePath(`/creator/${token}`);
}
