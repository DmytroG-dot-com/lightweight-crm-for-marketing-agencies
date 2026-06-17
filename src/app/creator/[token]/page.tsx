import Link from "next/link";
import { updateCreatorAssignment } from "@/actions/public";
import { ChevronDown } from "lucide-react";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { CreatorPortalLiveRefresh } from "@/components/creator-portal-live-refresh";
import { StatusPill } from "@/components/status-pill";
import { createAdminClient } from "@/lib/supabase/admin";
import { creativeDateTone, formatDateTime } from "@/lib/utils";

type CreativeRequestComment = {
  id: string;
  creative_request_id: string;
  author_type: "agency" | "creator";
  author_name: string;
  body: string;
  created_at: string;
};

function relatedClientStatus(value: unknown) {
  const client = Array.isArray(value) ? value[0] : value;
  return client && typeof client === "object" && "status" in client
    ? String(client.status)
    : null;
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildCreatorQuery(
  token: string,
  current: { client?: string; completed?: string },
  overrides: Record<string, string | null | undefined>,
) {
  const params = new URLSearchParams();
  if (current.client) params.set("client", current.client);
  if (current.completed) params.set("completed", current.completed);
  for (const [key, value] of Object.entries(overrides)) {
    if (!value) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `/creator/${token}?${query}` : `/creator/${token}`;
}

export default async function CreatorPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ client?: string | string[]; completed?: string | string[] }>;
}) {
  const { token } = await params;
  const filters = await searchParams;
  const admin = createAdminClient();
  const { data: creator } = await admin
    .from("external_creators")
    .select("id, agency_id, name, active")
    .eq("portal_token", token)
    .eq("active", true)
    .maybeSingle();
  if (!creator) return <PortalMessage />;

  const { data: requests } = await admin
    .from("creative_requests")
    .select("id, client_id, title, status, due_date, hypothesis, brief, references_url, notes, completed_drive_folder_url, submitted_at, archived_at, clients(name, status)")
    .eq("creator_id", creator.id)
    .eq("agency_id", creator.agency_id)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });
  const activeRequests = requests?.filter((request) =>
    relatedClientStatus(request.clients) !== "archived",
  );
  const clientFilter = firstQueryValue(filters.client);
  const showCompleted = firstQueryValue(filters.completed) === "1";
  const visibleStatuses = new Set(showCompleted
    ? ["in_progress", "review", "approved", "launched", "stopped"]
    : ["in_progress", "review"]);
  const availableClients = Array.from(new Map(
    (activeRequests ?? []).map((request) => {
      const client = Array.isArray(request.clients) ? request.clients[0] : request.clients;
      return [request.client_id ?? client?.name ?? "", { id: request.client_id, name: client?.name ?? "Client" }];
    }),
  ).values()).filter((client) => client.id);
  const visibleRequests = (activeRequests ?? []).filter((request) => {
    if (!visibleStatuses.has(request.status)) return false;
    if (!clientFilter) return true;
    return request.client_id === clientFilter;
  });
  const requestIds = activeRequests?.map((request) => request.id) ?? [];
  const { data: commentRows, error: commentsError } = requestIds.length
    ? await admin
      .from("creative_request_comments")
      .select("id, creative_request_id, author_type, author_name, body, created_at")
      .eq("agency_id", creator.agency_id)
      .in("creative_request_id", requestIds)
      .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (commentsError) throw new Error(commentsError.message);
  const commentsByRequest = new Map<string, CreativeRequestComment[]>();
  ((commentRows ?? []) as CreativeRequestComment[]).forEach((comment) => {
    const current = commentsByRequest.get(comment.creative_request_id) ?? [];
    current.push(comment);
    commentsByRequest.set(comment.creative_request_id, current);
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <CreatorPortalLiveRefresh />
      <header className="mb-8">
        <p className="text-sm font-medium text-zinc-500">Creator portal</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Welcome, {creator.name}</h1>
        <p className="mt-2 text-sm text-zinc-500">In progress and review requests are shown by default. Use filters to narrow by client or reveal completed work.</p>
      </header>
      <div className="mb-6 flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <AutoFilterForm className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">Client</span>
            <select name="client" defaultValue={clientFilter} className="rounded-lg border px-3 py-2 text-sm text-zinc-700">
              <option value="">All clients</option>
              {availableClients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </label>
          {showCompleted && <input type="hidden" name="completed" value="1" />}
        </AutoFilterForm>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={buildCreatorQuery(token, { client: clientFilter, completed: showCompleted ? "1" : "" }, { completed: showCompleted ? null : "1" })}
            className="rounded-lg border px-3 py-2 font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            {showCompleted ? "Hide completed" : "Show completed"}
          </Link>
          {(clientFilter || showCompleted) && (
            <Link
              href={buildCreatorQuery(token, { client: clientFilter, completed: showCompleted ? "1" : "" }, { client: null, completed: null })}
              className="text-zinc-500 underline"
            >
              Clear
            </Link>
          )}
        </div>
      </div>
      <div className="space-y-4">
        {!visibleRequests.length && <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-zinc-500">No requests match the current filters.</div>}
        {visibleRequests.map((request) => {
          const client = Array.isArray(request.clients) ? request.clients[0] : request.clients;
          const comments = commentsByRequest.get(request.id) ?? [];
          return (
            <details key={request.id} className="group rounded-xl border bg-white">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4 marker:hidden [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-500">{client?.name}</p>
                  <h2 className="mt-1 font-semibold text-zinc-950">{request.title}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    {request.due_date && (
                      <span
                        className={`inline-flex items-center border px-2 py-1 font-medium ${
                          creativeDateTone(request.due_date, request.status) || "border-zinc-200 text-zinc-600"
                        }`}
                      >
                        Due {request.due_date}
                      </span>
                    )}
                    {!!comments.length && <span>{comments.length} comment{comments.length === 1 ? "" : "s"}</span>}
                    {request.completed_drive_folder_url && <span className="text-emerald-700">Content link added</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusPill value={request.status} />
                  <ChevronDown className="size-4 text-zinc-400 transition group-open:rotate-180" />
                </div>
              </summary>
              <div className="border-t px-5 pb-5 pt-4">
                <div className="grid gap-4 rounded-lg bg-zinc-50 p-4 text-sm">
                  <div><p className="text-xs font-semibold uppercase text-zinc-400">Direction</p><p className="mt-1">{request.hypothesis}</p></div>
                  <div><p className="text-xs font-semibold uppercase text-zinc-400">Brief</p><p className="mt-1 whitespace-pre-wrap text-zinc-600">{request.brief || "—"}</p></div>
                  <div><p className="text-xs font-semibold uppercase text-zinc-400">Notes</p><p className="mt-1 whitespace-pre-wrap text-zinc-600">{request.notes || "—"}</p></div>
                  {request.references_url && <a href={request.references_url} target="_blank" rel="noreferrer" className="break-all underline">Open references</a>}
                </div>
                <div className="mt-4 rounded-lg border bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-400">Comments</p>
                  {!comments.length ? (
                    <p className="mt-3 text-sm text-zinc-500">No comments yet.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {comments.map((comment) => (
                        <div
                          key={comment.id}
                          className={`rounded-xl border px-3 py-2 text-sm ${comment.author_type === "creator" ? "border-violet-200 bg-violet-50/60" : "border-zinc-200 bg-zinc-50"}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.08em]">
                            <span className={comment.author_type === "creator" ? "text-violet-700" : "text-zinc-600"}>{comment.author_name}</span>
                            <span className="text-zinc-400">{formatDateTime(comment.created_at)}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-zinc-700">{comment.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <form action={updateCreatorAssignment} className="mt-4 grid gap-4">
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="request_id" value={request.id} />
                  <label className="text-sm font-medium">
                    Reply to agency
                    <textarea name="comment_body" rows={4} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
                  </label>
                  <label className="text-sm font-medium">Completed Drive folder URL<input name="completed_drive_folder_url" type="url" defaultValue={request.completed_drive_folder_url ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
                  <button className="w-fit rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Post update</button>
                </form>
              </div>
            </details>
          );
        })}
      </div>
    </main>
  );
}

function PortalMessage() {
  return <main className="grid min-h-screen place-items-center px-4"><div className="rounded-2xl border bg-white p-7 text-center shadow-sm"><h1 className="text-xl font-semibold">Portal unavailable</h1><p className="mt-2 text-sm text-zinc-500">This creator portal is invalid or inactive.</p></div></main>;
}
