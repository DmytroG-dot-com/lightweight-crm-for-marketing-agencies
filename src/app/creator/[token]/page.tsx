import { updateCreatorAssignment } from "@/actions/public";
import { StatusPill } from "@/components/status-pill";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function CreatorPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: creator } = await admin
    .from("external_creators")
    .select("id, agency_id, name, active")
    .eq("portal_token", token)
    .eq("active", true)
    .maybeSingle();
  if (!creator) return <PortalMessage />;

  // The creator ID from the validated token is applied to the assignment query.
  const { data: assignments } = await admin
    .from("creative_assignments")
    .select("*, creative_requests(hypothesis, brief, references_url, ad_names, clients(name))")
    .eq("creator_id", creator.id)
    .eq("agency_id", creator.agency_id)
    .order("assigned_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <header className="mb-8">
        <p className="text-sm font-medium text-zinc-500">Creator portal</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Welcome, {creator.name}</h1>
        <p className="mt-2 text-sm text-zinc-500">Only assets assigned to your creator account are shown here.</p>
      </header>
      <div className="space-y-4">
        {!assignments?.length && <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-zinc-500">No assignments yet.</div>}
        {assignments?.map((assignment) => (
          <section key={assignment.id} className="rounded-xl border bg-white p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row">
              <div><p className="text-xs font-medium text-zinc-500">{assignment.creative_requests?.clients?.name}</p><h2 className="mt-1 font-semibold">{assignment.asset_name}</h2></div>
              <StatusPill value={assignment.status} />
            </div>
            <div className="mt-4 grid gap-4 rounded-lg bg-zinc-50 p-4 text-sm">
              <div><p className="text-xs font-semibold uppercase text-zinc-400">Hypothesis</p><p className="mt-1">{assignment.creative_requests?.hypothesis}</p></div>
              <div><p className="text-xs font-semibold uppercase text-zinc-400">Brief</p><p className="mt-1 whitespace-pre-wrap text-zinc-600">{assignment.creative_requests?.brief || "—"}</p></div>
              <div><p className="text-xs font-semibold uppercase text-zinc-400">Ad names</p><p className="mt-1">{assignment.creative_requests?.ad_names?.join(", ") || "—"}</p></div>
              {assignment.creative_requests?.references_url && <a href={assignment.creative_requests.references_url} target="_blank" rel="noreferrer" className="break-all underline">Open references</a>}
            </div>
            <form action={updateCreatorAssignment} className="mt-4 grid gap-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="assignment_id" value={assignment.id} />
              <label className="text-sm font-medium">Completed Drive folder URL<input name="completed_drive_folder_url" type="url" defaultValue={assignment.completed_drive_folder_url ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
              <label className="text-sm font-medium">Comments<textarea name="comments" rows={4} defaultValue={assignment.comments ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
              <button className="w-fit rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Save update</button>
            </form>
          </section>
        ))}
      </div>
    </main>
  );
}

function PortalMessage() {
  return <main className="grid min-h-screen place-items-center px-4"><div className="rounded-2xl border bg-white p-7 text-center shadow-sm"><h1 className="text-xl font-semibold">Portal unavailable</h1><p className="mt-2 text-sm text-zinc-500">This creator portal is invalid or inactive.</p></div></main>;
}
