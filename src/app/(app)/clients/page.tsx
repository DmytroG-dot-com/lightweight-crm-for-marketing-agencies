import Link from "next/link";
import { Archive, Building2, Plus, UsersRound } from "lucide-react";
import { createClient } from "@/actions/crm";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { requireAgency } from "@/lib/auth";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showingArchived = archived === "1";
  const { supabase, agency } = await requireAgency();
  let clientsQuery = supabase
    .from("clients")
    .select("*")
    .eq("agency_id", agency.id)
    .order("name");
  clientsQuery = showingArchived
    ? clientsQuery.eq("status", "archived")
    : clientsQuery.neq("status", "archived");
  const { data: clients, error } = await clientsQuery;
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader title="Clients" description="Manage accounts, dossiers, tasks, and onboarding." />
      <div className="mb-8 flex gap-5 border-b border-zinc-200">
        <Link
          href="/clients"
          className={`flex items-center gap-1.5 border-b py-2 text-[9px] font-semibold uppercase tracking-[0.1em] transition ${
            showingArchived ? "border-transparent text-zinc-400 hover:text-zinc-800" : "border-blue-600 text-blue-700"
          }`}
        >
          <UsersRound className="size-3" />Active clients
        </Link>
        <Link
          href="/clients?archived=1"
          className={`flex items-center gap-1.5 border-b py-2 text-[9px] font-semibold uppercase tracking-[0.1em] transition ${
            showingArchived ? "border-zinc-500 text-zinc-700" : "border-transparent text-zinc-300 hover:text-zinc-700"
          }`}
        >
          <Archive className="size-3" />Archived clients
        </Link>
      </div>
      {!showingArchived && (
        <details className="mb-12 border-y bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[11px] font-semibold uppercase tracking-[0.1em]">
            Add client <Plus className="size-4" />
          </summary>
          <ActionForm action={createClient} className="grid gap-4 border-t p-5 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["name", "Client name", true],
              ["company_name", "Company name", false],
              ["contact_name", "Contact name", false],
              ["contact_email", "Contact email", false],
              ["website", "Website", false],
            ].map(([name, label, required]) => (
              <label key={String(name)} className="text-sm font-medium">
                {label}
                <input name={String(name)} required={Boolean(required)} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
              </label>
            ))}
            <label className="text-sm font-medium">
              Status
              <select name="status" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
                <option value="active">Active</option><option value="paused">Paused</option>
              </select>
            </label>
            <label className="text-sm font-medium md:col-span-2 xl:col-span-3">
              Notes
              <textarea name="notes" rows={3} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
            <button className="ui-action ui-action-primary w-fit">Create client</button>
          </ActionForm>
        </details>
      )}
      {!clients.length ? (
        <EmptyState
          title={showingArchived ? "No archived clients" : "No clients yet"}
          description={showingArchived ? "Archived client workspaces will appear here." : "Add the first client to create their default task lists and dossier."}
        />
      ) : (
        <div className="grid gap-x-12 gap-y-16 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={client.status === "archived" ? `/clients/${client.id}?tab=overview` : `/clients/${client.id}?tab=tasks&list=general`} className="group block border-t border-zinc-950 pt-3 transition hover:border-blue-600">
              <div className="flex min-h-36 flex-col justify-between gap-8">
                <div className="flex items-start justify-between gap-3">
                  <Building2 className="size-4 text-blue-500" />
                  <StatusPill value={client.status} />
                </div>
                <div>
                  <h2 className="text-xl font-normal uppercase leading-none tracking-[-0.045em] text-zinc-950 transition group-hover:translate-x-1 group-hover:text-blue-700">{client.name}</h2>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.05em] text-zinc-400">{client.company_name || client.contact_email || "No company details"}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
