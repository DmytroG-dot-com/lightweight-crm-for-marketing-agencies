import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/actions/crm";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { requireAgency } from "@/lib/auth";

export default async function ClientsPage() {
  const { supabase, agency } = await requireAgency();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("*")
    .eq("agency_id", agency.id)
    .order("name");
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader title="Clients" description="Manage accounts, dossiers, tasks, and onboarding." />
      <details className="mb-6 rounded-xl border bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold">
          <Plus className="size-4" /> Add client
        </summary>
        <form action={createClient} className="grid gap-4 border-t p-5 md:grid-cols-2 xl:grid-cols-3">
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
              <option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option>
            </select>
          </label>
          <label className="text-sm font-medium md:col-span-2 xl:col-span-3">
            Notes
            <textarea name="notes" rows={3} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <button className="w-fit rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Create client</button>
        </form>
      </details>
      {!clients.length ? (
        <EmptyState title="No clients yet" description="Add the first client to create their default task lists and dossier." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}?tab=tasks&list=general`} className="rounded-xl border bg-white p-5 transition hover:border-zinc-400 hover:shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-zinc-950">{client.name}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{client.company_name || client.contact_email || "No company details"}</p>
                </div>
                <StatusPill value={client.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
