"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAgency, requireClient } from "@/lib/auth";
import { CREATIVE_STATUSES } from "@/lib/constants";
import { addDays, dateInputValue, generateAdNames } from "@/lib/utils";

const optional = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim() || null;

export async function createCreativeRequest(formData: FormData) {
  const clientId = String(formData.get("client_id"));
  const context = await requireClient(clientId);
  const hypothesis = z.string().trim().min(1).parse(formData.get("hypothesis"));
  const assetsNeeded = z.coerce.number().int().positive().parse(formData.get("assets_needed") || 1);
  const preferredDate =
    optional(formData, "preferred_launch_date") ?? dateInputValue(addDays(new Date(), 4));

  const { data, error } = await context.supabase
    .from("creative_requests")
    .insert({
      agency_id: context.agency.id,
      client_id: clientId,
      hypothesis,
      status: "draft",
      preferred_launch_date: preferredDate,
      assets_needed: assetsNeeded,
      brief: optional(formData, "brief"),
      references_url: optional(formData, "references_url"),
      comments: optional(formData, "comments"),
      ad_names: generateAdNames(hypothesis, assetsNeeded),
      created_by: context.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId,
    action: "creative_request.created",
    entityType: "creative_request",
    entityId: data.id,
  });
  revalidatePath("/creative-master");
}

export async function updateCreativeStatus(formData: FormData) {
  const context = await requireAgency();
  const requestId = String(formData.get("request_id"));
  const status = z.enum(CREATIVE_STATUSES).parse(formData.get("status"));
  const { data, error } = await context.supabase
    .from("creative_requests")
    .update({ status })
    .eq("id", requestId)
    .eq("agency_id", context.agency.id)
    .select("client_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Creative request not found.");
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId: data.client_id,
    action: "creative_request.status_changed",
    entityType: "creative_request",
    entityId: requestId,
    metadata: { status },
  });
  revalidatePath("/creative-master");
}

export async function createExternalCreator(formData: FormData) {
  const context = await requireAgency();
  const name = z.string().trim().min(1).parse(formData.get("name"));
  const email = z.string().trim().email().parse(formData.get("email"));
  const { data, error } = await context.supabase
    .from("external_creators")
    .insert({ agency_id: context.agency.id, name, email })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "external_creator.created",
    entityType: "external_creator",
    entityId: data.id,
  });
  revalidatePath("/settings");
  revalidatePath("/creative-master");
}

export async function assignCreativeAsset(formData: FormData) {
  const context = await requireAgency();
  const requestId = String(formData.get("creative_request_id"));
  const creatorId = String(formData.get("creator_id"));
  const assetName = z.string().trim().min(1).parse(formData.get("asset_name"));
  const [{ data: request }, { data: creator }] = await Promise.all([
    context.supabase
      .from("creative_requests")
      .select("id, client_id")
      .eq("id", requestId)
      .eq("agency_id", context.agency.id)
      .maybeSingle(),
    context.supabase
      .from("external_creators")
      .select("id")
      .eq("id", creatorId)
      .eq("agency_id", context.agency.id)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (!request || !creator) throw new Error("Invalid request or creator.");

  const { data, error } = await context.supabase
    .from("creative_assignments")
    .insert({
      agency_id: context.agency.id,
      creative_request_id: requestId,
      creator_id: creatorId,
      asset_name: assetName,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    clientId: request.client_id,
    action: "creative_assignment.created",
    entityType: "creative_assignment",
    entityId: data.id,
  });
  revalidatePath("/creative-master");
}
