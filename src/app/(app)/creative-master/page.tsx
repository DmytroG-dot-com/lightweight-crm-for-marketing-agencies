import Link from "next/link";
import { CalendarDays, ExternalLink, Palette, Plus, Search, X } from "lucide-react";
import {
  createCreativeRequest,
} from "@/actions/creative";
import { AutoFilterForm } from "@/components/auto-filter-form";
import {
  CreativeCreatorSelect,
  CreativeDueDateInput,
  CreativeStatusSelect,
} from "@/components/creative-inline-controls";
import { CreativeRequestModal } from "@/components/creative-request-modal";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { getAgencyAiSettingsSummary } from "@/lib/ai/settings";
import { MAX_GENERATED_CREATIVE_IMAGES } from "@/lib/creative/constants";
import { requireAgency } from "@/lib/auth";
import { CREATIVE_STATUSES } from "@/lib/constants";
import { addDaysToDateValue, creativeDateTone, dateInputValue, formatLabel } from "@/lib/utils";

type SearchParams = {
  q?: string;
  status?: string;
  creator?: string;
  client?: string;
  sort?: string;
  view?: string;
  request?: string;
  clientId?: string;
  sourceTaskId?: string;
};

type CreativeRequestRow = {
  id: string;
  order_number: number;
  client_id: string;
  status: string;
  title: string;
  hypothesis: string;
  due_date: string;
  assets_needed: number;
  brief: string | null;
  brief_generated_at: string | null;
  references_url: string | null;
  notes: string | null;
  creator_id: string | null;
  persona_id: string | null;
  source_task_id: string | null;
  archived_at: string | null;
  completed_drive_folder_url: string | null;
  submitted_at: string | null;
  clients?: { name: string; status: string } | null;
};

type CreativeRequestComment = {
  id: string;
  creative_request_id: string;
  author_type: "agency" | "creator";
  author_name: string;
  body: string;
  created_at: string;
};

type SourceTask = {
  id: string;
  client_id: string;
  task_list_id: string | null;
  title: string;
  archived_at: string | null;
};

type PersonaOption = {
  id: string;
  client_id: string;
  name: string;
  segment: string | null;
  active: boolean;
  is_primary: boolean;
};

function buildQuery(current: SearchParams, overrides: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (typeof value === "string" && value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!value) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `/creative-master?${query}` : "/creative-master";
}

function compareText(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function sortRequests(requests: CreativeRequestRow[], sortKey: string | undefined) {
  const statusRank: Record<string, number> = {
    draft: 0,
    ready: 1,
    assigned: 2,
    in_progress: 3,
    review: 4,
    approved: 5,
    launched: 6,
    stopped: 7,
  };
  const selected = sortKey ?? "due";

  return [...requests].sort((left, right) => {
    if (selected === "newest") return right.order_number - left.order_number;
    if (selected === "oldest") return left.order_number - right.order_number;
    if (selected === "client") {
      return compareText(left.clients?.name.toLowerCase() ?? "", right.clients?.name.toLowerCase() ?? "");
    }
    if (selected === "status") {
      const delta = (statusRank[left.status] ?? 99) - (statusRank[right.status] ?? 99);
      return delta || compareText(left.title.toLowerCase(), right.title.toLowerCase());
    }

    if (!left.due_date && !right.due_date) return right.order_number - left.order_number;
    if (!left.due_date) return 1;
    if (!right.due_date) return -1;
    return compareText(left.due_date, right.due_date) || (right.order_number - left.order_number);
  });
}

function taskHref(task: SourceTask | null | undefined) {
  if (!task) return null;
  return `/clients/${task.client_id}?tab=tasks&list=${task.task_list_id ?? "general"}&task=${task.id}`;
}

export default async function CreativeMasterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = await searchParams;
  const context = await requireAgency();
  const today = dateInputValue(new Date(), context.membership.timezone);
  const view = filters.view === "archived" ? "archived" : "active";
  const safeQuery = filters.q?.trim().replace(/[,%]/g, " ");
  const normalizedOrderQuery = safeQuery?.replace(/^#/, "").trim() ?? "";
  const orderNumberQuery = /^\d+$/.test(normalizedOrderQuery) ? Number.parseInt(normalizedOrderQuery, 10) : null;

  let requestQuery = context.supabase
    .from("creative_requests")
    .select("id, order_number, client_id, status, title, hypothesis, due_date, assets_needed, brief, brief_generated_at, references_url, notes, creator_id, persona_id, source_task_id, archived_at, completed_drive_folder_url, submitted_at, clients!inner(name, status)")
    .eq("agency_id", context.agency.id)
    .neq("clients.status", "archived");

  if (view === "archived") requestQuery = requestQuery.not("archived_at", "is", null);
  else requestQuery = requestQuery.is("archived_at", null);

  if (filters.status) requestQuery = requestQuery.eq("status", filters.status);
  if (filters.creator) requestQuery = requestQuery.eq("creator_id", filters.creator);
  if (filters.client) requestQuery = requestQuery.eq("client_id", filters.client);
  if (safeQuery) {
    const searchClauses = [
      `title.ilike.%${safeQuery}%`,
      `hypothesis.ilike.%${safeQuery}%`,
      `brief.ilike.%${safeQuery}%`,
      `notes.ilike.%${safeQuery}%`,
    ];
    if (orderNumberQuery !== null) searchClauses.unshift(`order_number.eq.${orderNumberQuery}`);
    requestQuery = requestQuery.or(searchClauses.join(","));
  }

  const [{ data: requestRows, error: requestsError }, { data: clients, error: clientsError }, { data: creators, error: creatorsError }, { data: personas, error: personasError }, aiSettings] = await Promise.all([
    requestQuery.order("order_number", { ascending: false }),
    context.supabase
      .from("clients")
      .select("id, name, status")
      .eq("agency_id", context.agency.id)
      .neq("status", "archived")
      .order("name"),
    context.supabase
      .from("external_creators")
      .select("id, name, active")
      .eq("agency_id", context.agency.id)
      .order("name"),
    context.supabase
      .from("client_personas")
      .select("id, client_id, name, segment, active, is_primary")
      .eq("agency_id", context.agency.id)
      .eq("active", true)
      .order("is_primary", { ascending: false })
      .order("created_at"),
    getAgencyAiSettingsSummary(context.agency.id),
  ]);
  if (requestsError || clientsError || creatorsError || personasError) {
    throw new Error(requestsError?.message || clientsError?.message || creatorsError?.message || personasError?.message);
  }

  const requests = sortRequests((requestRows ?? []) as unknown as CreativeRequestRow[], filters.sort);
  const sourceTaskIds = [...new Set([
    ...requests.map((request) => request.source_task_id).filter((value): value is string => Boolean(value)),
    ...(filters.sourceTaskId ? [filters.sourceTaskId] : []),
  ])];
  const { data: sourceTasks, error: sourceTasksError } = sourceTaskIds.length
    ? await context.supabase
      .from("tasks")
      .select("id, client_id, task_list_id, title, archived_at")
      .eq("agency_id", context.agency.id)
      .in("id", sourceTaskIds)
    : { data: [], error: null };
  if (sourceTasksError) throw new Error(sourceTasksError.message);

  const sourceTaskById = new Map(((sourceTasks ?? []) as unknown as SourceTask[]).map((task) => [task.id, task]));
  const creatorById = new Map((creators ?? []).map((creator) => [creator.id, creator]));
  const personaById = new Map(((personas ?? []) as PersonaOption[]).map((persona) => [persona.id, persona]));
  const availableClients = clients ?? [];
  const availablePersonas = (personas ?? []) as PersonaOption[];
  const prefillSourceTask = filters.sourceTaskId ? sourceTaskById.get(filters.sourceTaskId) ?? null : null;
  const prefillClientId = prefillSourceTask?.client_id ?? filters.clientId ?? "";
  const hasFilters = Boolean(filters.q || filters.status || filters.creator || filters.client || filters.sort);
  const canManageCreativeAi = context.membership.role === "owner" || context.membership.role === "admin";
  const selectedRequest = filters.request
    ? requests.find((request) => request.id === filters.request) ?? null
    : null;
  const selectedSourceTask = selectedRequest?.source_task_id
    ? sourceTaskById.get(selectedRequest.source_task_id) ?? null
    : null;
  const { data: selectedRequestComments, error: selectedRequestCommentsError } = selectedRequest
    ? await context.supabase
      .from("creative_request_comments")
      .select("id, creative_request_id, author_type, author_name, body, created_at")
      .eq("agency_id", context.agency.id)
      .eq("creative_request_id", selectedRequest.id)
      .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (selectedRequestCommentsError) throw new Error(selectedRequestCommentsError.message);

  return (
    <>
      <PageHeader title="Creative Pipeline" description="Brief, assign, track, and archive creative requests." />

      <div className="mb-6 flex items-center gap-4 border-b border-zinc-200">
        <Link
          href={buildQuery(filters, { view: null, request: null })}
          className={`border-b px-0 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] ${view === "active" ? "border-zinc-950 text-zinc-950" : "border-transparent text-zinc-400 hover:text-zinc-950"}`}
        >
          Active
        </Link>
        <Link
          href={buildQuery(filters, { view: "archived", request: null })}
          className={`border-b px-0 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] ${view === "archived" ? "border-zinc-950 text-zinc-950" : "border-transparent text-zinc-400 hover:text-zinc-950"}`}
        >
          Archived
        </Link>
      </div>

      <details open={Boolean(prefillSourceTask || prefillClientId)} className="mb-8 border-y bg-white">
        <summary className="flex cursor-pointer items-center gap-2 py-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-violet-700">
          <Plus className="size-3.5" />
          New creative request
        </summary>
        <form action={createCreativeRequest} className="grid gap-5 border-t py-6 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">
            Client
            <select name="client_id" required defaultValue={prefillClientId} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">Select client</option>
              {availableClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Creator
            <select name="creator_id" defaultValue="" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">Unassigned</option>
              {(creators ?? []).map((creator) => <option key={creator.id} value={creator.id}>{creator.name}{creator.active === false ? " (inactive)" : ""}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            ICP
            <select name="persona_id" defaultValue="" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">Select ICP</option>
              {availablePersonas.map((persona) => {
                const personaClient = availableClients.find((client) => client.id === persona.client_id);
                return (
                  <option key={persona.id} value={persona.id}>
                    {(personaClient?.name ?? "Client")} · {persona.name}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="text-sm font-medium">
            Due
            <input name="due_date" type="date" defaultValue={addDaysToDateValue(today, 4)} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-medium">
            Creative count
            <input
              name="assets_needed"
              type="number"
              min="1"
              max={MAX_GENERATED_CREATIVE_IMAGES}
              defaultValue="1"
              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            References URL
            <input name="references_url" type="url" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          {prefillSourceTask && (
            <div className="border border-blue-200 bg-blue-50 px-4 py-3 text-sm md:col-span-2 xl:col-span-4">
              <input type="hidden" name="source_task_id" value={prefillSourceTask.id} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-700">Linked task</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-medium text-blue-950">{prefillSourceTask.title}</span>
                {taskHref(prefillSourceTask) && (
                  <Link href={taskHref(prefillSourceTask) ?? "#"} className="inline-flex items-center gap-1 text-xs text-blue-700 underline">
                    Open task
                    <ExternalLink className="size-3" />
                  </Link>
                )}
              </div>
            </div>
          )}
          <label className="text-sm font-medium md:col-span-2 xl:col-span-2">
            Request title
            <input
              name="title"
              required
              defaultValue={prefillSourceTask?.title ?? ""}
              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Campaign refresh request"
            />
          </label>
          <label className="text-sm font-medium md:col-span-2 xl:col-span-2">
            Direction
            <textarea
              name="hypothesis"
              rows={3}
              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="What angle, hook, or creative direction should be tested?"
            />
          </label>
          <label className="text-sm font-medium md:col-span-2 xl:col-span-2">
            Brief
            <textarea name="brief" rows={5} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-medium md:col-span-2 xl:col-span-2">
            Notes
            <textarea name="notes" rows={5} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <button className="ui-action ui-action-primary w-fit">Create request</button>
        </form>
      </details>

      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-3 xl:flex-row xl:items-center xl:justify-between">
        <AutoFilterForm className="ui-filter-bar">
          <label className="flex min-h-[1.9rem] items-center gap-2 border-b border-zinc-300 px-0.5 text-[10px] text-zinc-400">
            <Search className="size-3.5" />
            <input
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Search"
              className="min-w-36 bg-transparent text-xs text-zinc-700 outline-none placeholder:text-zinc-300"
            />
          </label>
          <label className="ui-filter-field" data-active={Boolean(filters.status)}>
            <span>Status</span>
            <select name="status" defaultValue={filters.status ?? ""}>
              <option value="">All</option>
              {CREATIVE_STATUSES.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
            </select>
          </label>
          <label className="ui-filter-field" data-active={Boolean(filters.creator)}>
            <span>Creator</span>
            <select name="creator" defaultValue={filters.creator ?? ""}>
              <option value="">All</option>
              {(creators ?? []).map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}
            </select>
          </label>
          <label className="ui-filter-field" data-active={Boolean(filters.client)}>
            <span>Client</span>
            <select name="client" defaultValue={filters.client ?? ""}>
              <option value="">All</option>
              {(clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
          <label className="ui-filter-field" data-active={Boolean(filters.sort)}>
            <span>Sort</span>
            <select name="sort" defaultValue={filters.sort ?? "due"}>
              <option value="due">Due</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="status">Status</option>
              <option value="client">Client</option>
            </select>
          </label>
          {view === "archived" && <input type="hidden" name="view" value="archived" />}
          {hasFilters && (
            <Link href={buildQuery(filters, { q: null, status: null, creator: null, client: null, sort: null, request: null })} className="ui-filter-clear">
              <X className="size-3" />
              Clear
            </Link>
          )}
        </AutoFilterForm>
      </div>

      {!requests.length ? (
        <EmptyState
          title={view === "archived" ? "No archived creative requests" : "No creative requests"}
          description={view === "archived" ? "Archive a creative request to keep history without cluttering active work." : "Create a creative request or adjust the current filters."}
        />
      ) : (
        <div className="border-y border-zinc-950 bg-white">
          {requests.map((request) => {
            const archived = Boolean(request.archived_at);
            const isOpen = filters.request === request.id;
            const creator = request.creator_id ? creatorById.get(request.creator_id) : null;
            const persona = request.persona_id ? personaById.get(request.persona_id) : null;
            const sourceTask = request.source_task_id ? sourceTaskById.get(request.source_task_id) ?? null : null;
            const requestHref = buildQuery(filters, { request: isOpen ? null : request.id });
            return (
              <article key={request.id} id={`creative-${request.id}`} className="border-b last:border-b-0">
                <div className={`grid gap-4 px-4 py-5 transition-colors lg:grid-cols-[minmax(0,1.6fr)_160px_180px_140px] lg:items-start ${isOpen ? "bg-zinc-50/80" : "hover:bg-zinc-50/60"}`}>
                  <div className="min-w-0">
                    <Link href={requestHref} className="block rounded-lg px-2 py-1 transition-colors hover:bg-zinc-100/80">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700">
                        <span className="inline-flex items-center gap-1.5">
                          <Palette className="size-3.5" />
                          #{request.order_number}
                        </span>
                        {archived && <span className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-zinc-500">Archived</span>}
                      </div>
                      <h2 className="mt-2 truncate text-base font-medium text-zinc-950">{request.title}</h2>
                      <p className="mt-1 text-sm text-zinc-500">{request.clients?.name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <StatusPill value={request.status} />
                        <span className="border border-zinc-200 px-2 py-1 text-zinc-600">
                          {request.assets_needed} {request.assets_needed === 1 ? "creative" : "creatives"}
                        </span>
                        {persona && <span className="border border-violet-200 bg-violet-50 px-2 py-1 text-violet-700">ICP: {persona.name}</span>}
                        {request.due_date && (
                          <span className={`inline-flex items-center gap-1.5 border px-2 py-1 ${creativeDateTone(request.due_date, request.status, context.membership.timezone) || "text-zinc-600 border-zinc-200"}`}>
                            <CalendarDays className="size-3.5" />
                            {request.due_date}
                          </span>
                        )}
                      </div>
                    </Link>
                    {sourceTask && taskHref(sourceTask) && (
                      <Link href={taskHref(sourceTask) ?? "#"} className="mt-3 inline-flex items-center gap-1.5 text-xs text-blue-700 underline">
                        Linked task: {sourceTask.title}
                        <ExternalLink className="size-3" />
                      </Link>
                    )}
                    {request.completed_drive_folder_url && (
                      <a href={request.completed_drive_folder_url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-emerald-700 underline">
                        Open submitted delivery folder
                      </a>
                    )}
                  </div>

                  <div>
                    <p className="ui-kicker mb-2">Status</p>
                    {archived ? (
                      <StatusPill value={request.status} />
                    ) : (
                      <CreativeStatusSelect
                        key={`${request.id}:${request.status}`}
                        requestId={request.id}
                        status={request.status}
                      />
                    )}
                  </div>

                  <div>
                    <p className="ui-kicker mb-2">Creator</p>
                    {archived ? (
                      <p className="text-sm text-zinc-600">{creator?.name ?? "Unassigned"}</p>
                    ) : (
                      <CreativeCreatorSelect
                        key={`${request.id}:${request.creator_id ?? "unassigned"}`}
                        requestId={request.id}
                        creatorId={request.creator_id}
                        creators={(creators ?? []).map((item) => ({ id: item.id, name: item.name, active: item.active }))}
                      />
                    )}
                  </div>

                  <div>
                    <p className="ui-kicker mb-2">Due</p>
                    {archived ? (
                      <p className="text-sm text-zinc-600">{request.due_date}</p>
                    ) : (
                      <CreativeDueDateInput
                        key={`${request.id}:${request.due_date}`}
                        requestId={request.id}
                        dueDate={request.due_date}
                      />
                    )}
                  </div>
                </div>

              </article>
            );
          })}
        </div>
      )}

      {selectedRequest && (
        <CreativeRequestModal
          key={`${selectedRequest.id}:${selectedRequest.brief_generated_at ?? "no-brief-generated-at"}:${selectedRequest.brief ?? "no-brief"}`}
          request={selectedRequest}
          comments={(selectedRequestComments ?? []) as CreativeRequestComment[]}
          creators={(creators ?? []).map((item) => ({ id: item.id, name: item.name, active: item.active }))}
          personas={availablePersonas}
          aiBriefEnabled={aiSettings.enabled && aiSettings.configured}
          aiUsesServerKey={aiSettings.usesServerKey}
          aiImageModel={aiSettings.imageModel}
          canManageCreativeAi={canManageCreativeAi}
          sourceTask={selectedSourceTask}
          closeHref={buildQuery(filters, { request: null })}
          timezone={context.membership.timezone}
        />
      )}
    </>
  );
}
