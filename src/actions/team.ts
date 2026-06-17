"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAgency, requireUser } from "@/lib/auth";
import { provisionAgencyForUser } from "@/lib/provision";
import { createAdminClient } from "@/lib/supabase/admin";

function requireAdmin(role: string) {
  if (role !== "owner" && role !== "admin") throw new Error("Only agency owners and admins can manage the team.");
}

export async function finishAccountSetup() {
  const { user } = await requireUser();
  await provisionAgencyForUser(user);
  redirect("/clients");
}

export async function updateAgencyName(formData: FormData) {
  const context = await requireAgency();
  requireAdmin(context.membership.role);
  const name = z.string().trim().min(2).max(100).parse(formData.get("name"));
  const { error } = await context.supabase
    .from("agencies")
    .update({ name })
    .eq("id", context.agency.id);
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "agency.renamed",
    entityType: "agency",
    entityId: context.agency.id,
    metadata: { name },
  });
  revalidatePath("/settings");
}

export async function updateMemberName(formData: FormData) {
  const context = await requireAgency();
  const membershipId = z.string().uuid().parse(formData.get("membership_id"));
  const displayName = z.string().trim().min(1).max(100).parse(formData.get("display_name"));
  const { data: target } = await context.supabase
    .from("agency_members")
    .select("id, user_id")
    .eq("id", membershipId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (!target) throw new Error("Team member not found.");
  if (
    target.user_id !== context.user.id &&
    context.membership.role !== "owner" &&
    context.membership.role !== "admin"
  ) {
    throw new Error("Only owners and admins can rename other team members.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("agency_members")
    .update({ display_name: displayName })
    .eq("id", membershipId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "team.member_renamed",
    entityType: "agency_member",
    entityId: membershipId,
    metadata: { display_name: displayName },
  });
  revalidatePath("/settings");
  revalidatePath("/my-work");
  revalidatePath("/clients");
}

export async function updateMemberRole(formData: FormData) {
  const context = await requireAgency();
  if (context.membership.role !== "owner") {
    throw new Error("Only the agency owner can change teammate access.");
  }

  const membershipId = z.string().uuid().parse(formData.get("membership_id"));
  const role = z.enum(["admin", "member"]).parse(formData.get("role"));

  const { data: target } = await context.supabase
    .from("agency_members")
    .select("id, user_id, role, email")
    .eq("id", membershipId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (!target) throw new Error("Team member not found.");
  if (target.user_id === context.user.id) {
    throw new Error("You cannot change your own access.");
  }
  if (target.role === "owner") {
    throw new Error("The agency owner access cannot be changed.");
  }
  if (target.role === role) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("agency_members")
    .update({ role })
    .eq("id", membershipId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "team.member_role_changed",
    entityType: "agency_member",
    entityId: membershipId,
    metadata: { email: target.email, role },
  });
  revalidatePath("/settings");
}

export async function inviteTeamMember(formData: FormData) {
  const context = await requireAgency();
  requireAdmin(context.membership.role);
  const email = z.string().trim().email().parse(formData.get("email")).toLowerCase();
  const role = z.enum(["admin", "member"]).parse(formData.get("role"));
  const admin = createAdminClient();

  const { data: existingMember } = await admin
    .from("agency_members")
    .select("agency_id")
    .ilike("email", email)
    .maybeSingle();
  if (existingMember) {
    throw new Error(
      existingMember.agency_id === context.agency.id
        ? "This person is already an agency member."
        : "This person already belongs to another agency.",
    );
  }

  await admin
    .from("team_invitations")
    .delete()
    .eq("email", email)
    .is("accepted_at", null)
    .lt("expires_at", new Date().toISOString());

  const { data: invitation, error } = await admin
    .from("team_invitations")
    .insert({
      agency_id: context.agency.id,
      email,
      role,
      invited_by: context.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "team.invited",
    entityType: "team_invitation",
    entityId: invitation.id,
    metadata: { email, role },
  });
  revalidatePath("/settings");
}

export async function cancelTeamInvitation(formData: FormData) {
  const context = await requireAgency();
  requireAdmin(context.membership.role);
  const invitationId = z.string().uuid().parse(formData.get("invitation_id"));
  const { error } = await context.supabase
    .from("team_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("agency_id", context.agency.id)
    .is("accepted_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function removeTeamMember(formData: FormData) {
  const context = await requireAgency();
  requireAdmin(context.membership.role);
  const membershipId = z.string().uuid().parse(formData.get("membership_id"));
  const { data: target } = await context.supabase
    .from("agency_members")
    .select("id, user_id, role, email")
    .eq("id", membershipId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();
  if (!target) throw new Error("Team member not found.");
  if (target.user_id === context.user.id) throw new Error("You cannot remove yourself.");
  if (target.role === "owner") throw new Error("The agency owner cannot be removed.");
  if (context.membership.role === "admin" && target.role === "admin") {
    throw new Error("Only the owner can remove another admin.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("agency_members")
    .delete()
    .eq("id", membershipId)
    .eq("agency_id", context.agency.id);
  if (error) throw new Error(error.message);
  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "team.member_removed",
    entityType: "agency_member",
    entityId: membershipId,
    metadata: { email: target.email },
  });
  revalidatePath("/settings");
}
