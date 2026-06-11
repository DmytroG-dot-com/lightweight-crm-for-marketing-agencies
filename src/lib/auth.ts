import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AgencyContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string };
  agency: { id: string; name: string };
  membership: {
    role: "owner" | "admin" | "member";
    display_name: string | null;
    email: string | null;
  };
};

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
}

export async function requireAgency(): Promise<AgencyContext> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("agency_members")
    .select("agency_id, role, display_name, email, agencies(id, name)")
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
    },
  };
}

export async function requireClient(clientId: string) {
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
}
