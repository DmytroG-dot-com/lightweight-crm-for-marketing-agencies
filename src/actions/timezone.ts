"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAgency } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidTimeZone } from "@/lib/utils";

const timezoneSchema = z.object({
  timezone: z.string().trim().min(1).max(100),
  auto: z.boolean(),
});

export async function updateUserTimezone(input: unknown) {
  const context = await requireAgency();
  const parsed = timezoneSchema.parse(input);
  if (!isValidTimeZone(parsed.timezone)) throw new Error("Select a valid timezone.");

  // The service-role client is server-only. Scope this write to the authenticated
  // user's membership so a member cannot alter another user's preferences.
  const { data, error } = await createAdminClient()
    .from("agency_members")
    .update({
      timezone: parsed.timezone,
      timezone_auto: parsed.auto,
    })
    .eq("agency_id", context.agency.id)
    .eq("user_id", context.user.id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Agency membership not found.");

  revalidatePath("/", "layout");
}
