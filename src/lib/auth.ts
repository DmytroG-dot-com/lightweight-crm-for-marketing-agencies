import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AgencyContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string };
  agency: { id: string; name: string };
  membership: {
    role: "owner" | "admin" | "member";
    display_name: string | null;
    email: string | null;
    timezone: string;
    timezone_auto: boolean;
  };
};

export const requireUser = cache(async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) redirect("/login");
  return {
    supabase,
    user: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : undefined,
    },
  };
});

export const requireAgency = cache(async function requireAgency(): Promise<AgencyContext> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("agency_members")
    .select("agency_id, role, display_name, email, timezone, timezone_auto, agencies(id, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) redirect("/no-agency");

  const agencyValue = data.agencies as unknown as { id: string; name: string } | null;
  if (!agencyValue) redirect("/no-agency");

  return {
    supabase,
    user: { id: user.id, email: user.email },
    agency: agencyValue,
    membership: {
      role: data.role,
      display_name: data.display_name,
      email: data.email,
      timezone: data.timezone,
      timezone_auto: data.timezone_auto,
    },
  };
});

export const requireClient = cache(async function requireClient(clientId: string) {
  const context = await requireAgency();
  const { data, error } = await context.supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("agency_id", context.agency.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) redirect("/clients");
  return { ...context, client: data };
});

export const requireAgencyAdmin = cache(async function requireAgencyAdmin() {
  const context = await requireAgency();
  if (context.membership.role !== "owner" && context.membership.role !== "admin") redirect("/my-work");
  return context;
});
