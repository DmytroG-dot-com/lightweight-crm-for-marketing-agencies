"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/login?error=Email%20is%20required");

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${appUrl}/auth/callback?next=/clients`,
    },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/login?sent=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function sendInviteMagicLink(formData: FormData) {
  const token = z.string().uuid().parse(formData.get("token"));
  const admin = createAdminClient();
  const { data: invitation } = await admin
    .from("team_invitations")
    .select("email, accepted_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (
    !invitation ||
    invitation.accepted_at ||
    new Date(invitation.expires_at) <= new Date()
  ) {
    redirect(`/invite/${token}?error=This%20invitation%20is%20invalid%20or%20expired`);
  }

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email: invitation.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${appUrl}/auth/callback?next=/clients&invite=${token}`,
    },
  });
  if (error) redirect(`/invite/${token}?error=${encodeURIComponent(error.message)}`);
  redirect(`/invite/${token}?sent=1`);
}
