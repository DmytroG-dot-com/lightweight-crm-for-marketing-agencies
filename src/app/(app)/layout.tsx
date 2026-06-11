import { signOut } from "@/actions/auth";
import { Sidebar } from "@/components/sidebar";
import { requireAgency } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { agency, membership, user, supabase } = await requireAgency();
  const label = membership.display_name || membership.email || user.email || "Signed in";
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("agency_id", agency.id)
    .neq("status", "archived")
    .order("name");

  return (
    <div className="min-h-screen">
      <Sidebar agencyName={agency.name} userLabel={label} clients={clients ?? []} signOutAction={signOut} />
      <main className="mx-auto min-h-screen max-w-[1600px] px-4 pb-12 pt-20 md:ml-64 md:px-8 md:pt-8">
        {children}
      </main>
    </div>
  );
}
