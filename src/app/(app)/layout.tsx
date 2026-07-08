import { signOut } from "@/actions/auth";
import { Sidebar } from "@/components/sidebar";
import { TimezoneSync } from "@/components/timezone-sync";
import { requireAgency } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { agency, membership, user, supabase } = await requireAgency();
  const label = membership.display_name || membership.email || user.email || "Signed in";
  const [{ data: clients }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("agency_id", agency.id)
      .neq("status", "archived")
      .order("name"),
    supabase
      .from("notifications")
      .select("id, clients!inner(status)", { count: "exact", head: true })
      .eq("agency_id", agency.id)
      .eq("recipient_id", user.id)
      .neq("clients.status", "archived")
      .is("read_at", null)
      .is("cleared_at", null),
  ]);

  return (
    <div className="min-h-screen overflow-x-clip">
      <TimezoneSync savedTimezone={membership.timezone} autoDetect={membership.timezone_auto} />
      <Sidebar
        agencyId={agency.id}
        agencyName={agency.name}
        userLabel={label}
        userId={user.id}
        clients={clients ?? []}
        unreadCount={unreadCount ?? 0}
        canManageTeam={membership.role === "owner" || membership.role === "admin"}
        signOutAction={signOut}
      />
      <main className="min-h-screen min-w-0 overflow-x-clip px-5 pb-20 pt-24 md:ml-[270px] md:px-12 md:pt-10 xl:px-20">
        {children}
      </main>
    </div>
  );
}
