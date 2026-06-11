import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function provisionAgencyForUser(
  user: { id: string; email?: string | null },
  inviteToken?: string | null,
) {
  if (!user.email) throw new Error("Your Supabase user does not have an email address.");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("provision_user_agency", {
    target_user_id: user.id,
    target_email: user.email,
    invite_token: inviteToken ?? null,
  });

  if (error) throw new Error(error.message);
  return data as string;
}
