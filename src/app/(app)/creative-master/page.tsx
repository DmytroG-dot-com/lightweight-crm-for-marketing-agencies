import { assignCreativeAsset, createCreativeRequest, updateCreativeStatus } from "@/actions/creative";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { requireAgency } from "@/lib/auth";
import { CREATIVE_STATUSES } from "@/lib/constants";
import { addDays, creativeDateTone, dateInputValue, formatLabel } from "@/lib/utils";

export default async function CreativeMasterPage() {
  const context = await requireAgency();
  const [{ data: requests }, { data: clients }, { data: creators }] = await Promise.all([
    context.supabase
      .from("creative_requests")
      .select("*, clients(name), creative_assignments(id, asset_name, status, completed_drive_folder_url, external_creators(name))")
      .eq("agency_id", context.agency.id)
      .order("order_number", { ascending: false }),
    context.supabase.from("clients").select("id, name").eq("agency_id", context.agency.id).eq("status", "active").order("name"),
    context.supabase.from("external_creators").select("id, name").eq("agency_id", context.agency.id).eq("active", true).order("name"),
  ]);

  return (
    <>
      <PageHeader title="Creative Master" description="Track hypotheses, production assignments, and launch timing." />
      <details className="mb-6 rounded-xl border bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">New creative request</summary>
        <form action={createCreativeRequest} className="grid gap-4 border-t p-5 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">Client<select name="client_id" required className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"><option value="">Select client</option>{clients?.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <label className="text-sm font-medium">Assets needed<input name="assets_needed" type="number" min="1" defaultValue="1" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
          <label className="text-sm font-medium">Preferred launch<input name="preferred_launch_date" type="date" defaultValue={dateInputValue(addDays(new Date(), 4))} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
          <label className="text-sm font-medium">References URL<input name="references_url" type="url" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
          <label className="text-sm font-medium md:col-span-2 xl:col-span-4">Hypothesis<textarea name="hypothesis" required rows={3} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" placeholder="If we lead with..." /></label>
          <label className="text-sm font-medium md:col-span-2">Brief<textarea name="brief" rows={4} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
          <label className="text-sm font-medium md:col-span-2">Comments<textarea name="comments" rows={4} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
          <button className="w-fit rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Create request</button>
        </form>
      </details>
      {!requests?.length ? <EmptyState title="No creative requests" description="Create a hypothesis to generate draft ad names and a target launch date." /> : (
        <div className="space-y-3">
          {requests.map((request) => (
            <details key={request.id} className="rounded-xl border bg-white">
              <summary className="grid cursor-pointer list-none gap-3 px-5 py-4 md:grid-cols-[80px_1fr_150px_150px] md:items-center">
                <span className="text-xs font-semibold text-zinc-500">#{request.order_number}</span>
                <span><span className="block font-medium">{request.hypothesis}</span><span className="text-xs text-zinc-500">{request.clients?.name}</span></span>
                <StatusPill value={request.status} />
                <span className={`w-fit rounded-full px-2 py-1 text-xs ring-1 ring-inset ${creativeDateTone(request.preferred_launch_date, request.status) || "text-zinc-600 ring-zinc-200"}`}>{request.preferred_launch_date}</span>
              </summary>
              <div className="grid gap-5 border-t p-5 lg:grid-cols-2">
                <div className="space-y-4 text-sm">
                  <div><p className="text-xs font-semibold uppercase text-zinc-400">Ad names</p><p className="mt-1">{request.ad_names?.join(", ") || "—"}</p></div>
                  <div><p className="text-xs font-semibold uppercase text-zinc-400">Brief</p><p className="mt-1 whitespace-pre-wrap text-zinc-600">{request.brief || "—"}</p></div>
                  <div><p className="text-xs font-semibold uppercase text-zinc-400">References</p>{request.references_url ? <a className="mt-1 block break-all text-zinc-600 underline" href={request.references_url} target="_blank" rel="noreferrer">{request.references_url}</a> : <p>—</p>}</div>
                  <div><p className="text-xs font-semibold uppercase text-zinc-400">Comments</p><p className="mt-1 whitespace-pre-wrap text-zinc-600">{request.comments || "—"}</p></div>
                  <form action={updateCreativeStatus} className="flex gap-2">
                    <input type="hidden" name="request_id" value={request.id} />
                    <select name="status" defaultValue={request.status} className="rounded-lg border px-3 py-2 text-sm">{CREATIVE_STATUSES.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}</select>
                    <button className="rounded-lg border px-3 py-2 text-sm font-medium">Update</button>
                  </form>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-zinc-400">Creator assignments</p>
                  <div className="space-y-2">
                    {request.creative_assignments?.map((assignment: { id: string; asset_name: string; status: string; completed_drive_folder_url: string | null; external_creators: { name: string } | null }) => <div key={assignment.id} className="rounded-lg bg-zinc-50 px-3 py-2 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{assignment.asset_name}</span><StatusPill value={assignment.status} /></div><p className="mt-1 text-xs text-zinc-500">{assignment.external_creators?.name}</p>{assignment.completed_drive_folder_url && <a href={assignment.completed_drive_folder_url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs underline">Completed folder</a>}</div>)}
                    {!request.creative_assignments?.length && <p className="text-sm text-zinc-500">No assets assigned.</p>}
                  </div>
                  <form action={assignCreativeAsset} className="mt-4 grid gap-2 sm:grid-cols-2">
                    <input type="hidden" name="creative_request_id" value={request.id} />
                    <input name="asset_name" required placeholder="Asset name" className="rounded-lg border px-3 py-2 text-sm" />
                    <select name="creator_id" required className="rounded-lg border px-3 py-2 text-sm"><option value="">Select creator</option>{creators?.map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}</select>
                    <button className="w-fit rounded-lg border px-3 py-2 text-sm font-medium">Assign asset</button>
                  </form>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
