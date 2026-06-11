import Link from "next/link";
import {
  archiveTaskList,
  copyOnboardingToDossier,
  createRecurringRule,
  createTaskList,
  deleteTaskList,
  generateOnboardingLink,
  updateClient,
} from "@/actions/crm";
import { ClientTabs } from "@/components/client-tabs";
import { DossierForm } from "@/components/dossier-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { TaskForm } from "@/components/task-form";
import { type List, type Member, type Task, TaskTable } from "@/components/task-table";
import { requireClient } from "@/lib/auth";
import { signTaskAttachments } from "@/lib/comment-attachments";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { addDays, dateInputValue, formatLabel } from "@/lib/utils";

type Search = {
  tab?: string;
  status?: string;
  assignee?: string;
  priority?: string;
  due?: string;
  list?: string;
};

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Search>;
}) {
  const { clientId } = await params;
  const filters = await searchParams;
  const tab = filters.tab ?? "tasks";
  const context = await requireClient(clientId);
  const { data: taskLists } = await context.supabase
    .from("task_lists")
    .select("id, name, kind")
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("created_at");
  const lists = (taskLists ?? []) as List[];
  const requestedList = filters.list ?? "general";
  const selectedList = lists.find((list) =>
    requestedList === "general" || requestedList === "recurring"
      ? list.kind === requestedList
      : list.id === requestedList,
  ) ?? lists.find((list) => list.kind === "general");

  let taskQuery = context.supabase
    .from("tasks")
    .select("*, task_comments(id, body, created_at, author_id, task_comment_attachments(id, storage_path, file_name, content_type, size_bytes))")
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (selectedList) taskQuery = taskQuery.eq("task_list_id", selectedList.id);
  if (filters.status) taskQuery = taskQuery.eq("status", filters.status);
  if (filters.assignee) taskQuery = taskQuery.eq("assignee_id", filters.assignee);
  if (filters.priority) taskQuery = taskQuery.eq("priority", filters.priority);
  if (filters.due === "overdue") taskQuery = taskQuery.lt("due_date", dateInputValue()).neq("status", "complete");
  if (filters.due === "today") taskQuery = taskQuery.eq("due_date", dateInputValue());
  if (filters.due === "week") taskQuery = taskQuery.lte("due_date", dateInputValue(addDays(new Date(), 7)));

  const [
    { data: members },
    { data: tasks },
    { data: dossier },
    { data: rules },
    { data: links },
    { data: submissions },
    { data: activity },
  ] = await Promise.all([
    context.supabase.from("agency_members").select("user_id, display_name, email").eq("agency_id", context.agency.id).order("display_name"),
    taskQuery,
    context.supabase.from("dossiers").select("*").eq("agency_id", context.agency.id).eq("client_id", clientId).maybeSingle(),
    context.supabase.from("recurring_task_rules").select("*").eq("agency_id", context.agency.id).eq("client_id", clientId).order("next_run_at"),
    context.supabase.from("onboarding_links").select("*").eq("agency_id", context.agency.id).eq("client_id", clientId).order("created_at", { ascending: false }),
    context.supabase.from("onboarding_submissions").select("*").eq("agency_id", context.agency.id).eq("client_id", clientId).order("submitted_at", { ascending: false }),
    context.supabase.from("activity_logs").select("*").eq("agency_id", context.agency.id).eq("client_id", clientId).order("created_at", { ascending: false }).limit(100),
  ]);

  const agencyMembers = (members ?? []) as Member[];
  const clientTasks = (tasks ?? []) as Task[];
  await signTaskAttachments(clientTasks);
  const selectedListParam = selectedList?.kind === "general" || selectedList?.kind === "recurring"
    ? selectedList.kind
    : selectedList?.id ?? "general";

  return (
    <>
      <PageHeader
        title={context.client.name}
        description={context.client.company_name || context.client.contact_email || "Client workspace"}
        actions={<StatusPill value={context.client.status} />}
      />
      <ClientTabs clientId={clientId} active={tab} />

      {tab === "overview" && (
        <form action={updateClient} className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2 xl:grid-cols-3">
          <input type="hidden" name="client_id" value={clientId} />
          {[
            ["name", "Client name", context.client.name],
            ["company_name", "Company name", context.client.company_name],
            ["contact_name", "Contact name", context.client.contact_name],
            ["contact_email", "Contact email", context.client.contact_email],
            ["website", "Website", context.client.website],
          ].map(([name, label, value]) => (
            <label key={String(name)} className="text-sm font-medium">
              {label}
              <input name={String(name)} required={name === "name"} defaultValue={String(value ?? "")} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
          ))}
          <label className="text-sm font-medium">
            Status
            <select name="status" defaultValue={context.client.status} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option>
            </select>
          </label>
          <label className="text-sm font-medium md:col-span-2 xl:col-span-3">
            Notes
            <textarea name="notes" rows={5} defaultValue={context.client.notes ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <button className="w-fit rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Save client</button>
        </form>
      )}

      {tab === "tasks" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {lists.map((list) => {
              const listParam = list.kind === "general" || list.kind === "recurring" ? list.kind : list.id;
              const active = selectedList?.id === list.id;
              return (
                <Link
                  key={list.id}
                  href={`/clients/${clientId}?tab=tasks&list=${listParam}`}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${active ? "border-zinc-950 bg-zinc-950 text-white" : "bg-white text-zinc-600"}`}
                >
                  {list.name}
                </Link>
              );
            })}
            {selectedList?.kind === "custom" && (
              <div className="ml-auto flex items-center gap-3">
                <form action={archiveTaskList}>
                  <input type="hidden" name="client_id" value={clientId} />
                  <input type="hidden" name="list_id" value={selectedList.id} />
                  <button className="text-xs font-medium text-zinc-600">Archive list</button>
                </form>
                <form action={deleteTaskList}>
                  <input type="hidden" name="client_id" value={clientId} />
                  <input type="hidden" name="list_id" value={selectedList.id} />
                  <button className="text-xs font-medium text-red-600">Delete empty list</button>
                </form>
              </div>
            )}
          </div>
          <details className="rounded-xl border bg-white">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Create task</summary>
            <div className="border-t p-4"><TaskForm clientId={clientId} lists={lists} members={agencyMembers} tasks={clientTasks} preferredListId={selectedList?.id} /></div>
          </details>
          <div className="flex flex-col gap-4 rounded-xl border bg-white p-4 xl:flex-row xl:items-end xl:justify-between">
            <form className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="tab" value="tasks" />
              <input type="hidden" name="list" value={selectedListParam} />
              <FilterSelect name="status" label="Status" value={filters.status} options={TASK_STATUSES} />
              <FilterSelect name="priority" label="Priority" value={filters.priority} options={TASK_PRIORITIES} />
              <label className="text-xs font-medium text-zinc-500">
                Assignee
                <select name="assignee" defaultValue={filters.assignee ?? ""} className="mt-1 block rounded-lg border px-3 py-2 text-sm text-zinc-900">
                  <option value="">All</option>
                  {agencyMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.email}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-zinc-500">
                Due
                <select name="due" defaultValue={filters.due ?? ""} className="mt-1 block rounded-lg border px-3 py-2 text-sm text-zinc-900">
                  <option value="">Any</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="week">Next 7 days</option>
                </select>
              </label>
              <button className="rounded-lg border px-3 py-2 text-sm font-medium">Filter</button>
              <Link href={`/clients/${clientId}?tab=tasks&list=${selectedListParam}`} className="px-2 py-2 text-sm text-zinc-500">Clear</Link>
            </form>
            <form action={createTaskList} className="flex gap-2">
              <input type="hidden" name="client_id" value={clientId} />
              <input name="name" required placeholder="Custom list name" className="rounded-lg border px-3 py-2 text-sm" />
              <button className="rounded-lg border px-3 py-2 text-sm font-medium">Add list</button>
            </form>
          </div>
          <TaskTable tasks={clientTasks} lists={lists} members={agencyMembers} agencyId={context.agency.id} />
        </div>
      )}

      {tab === "dossier" && <DossierForm clientId={clientId} dossier={dossier} />}

      {tab === "recurring" && (
        <div className="space-y-5">
          <details className="rounded-xl border bg-white">
            <summary className="cursor-pointer px-5 py-4 text-sm font-semibold">Add recurring task rule</summary>
            <form action={createRecurringRule} className="grid gap-4 border-t p-5 md:grid-cols-2 xl:grid-cols-4">
              <input type="hidden" name="client_id" value={clientId} />
              <label className="text-sm font-medium xl:col-span-2">Title<input name="title" required className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
              <label className="text-sm font-medium">Frequency<select name="frequency" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"><option value="weekly">Weekly</option><option value="daily">Daily</option><option value="monthly">Monthly</option></select></label>
              <label className="text-sm font-medium">Every<input name="interval_count" type="number" min="1" defaultValue="1" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
              <label className="text-sm font-medium">Next run<input name="next_run_at" type="date" required defaultValue={dateInputValue()} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
              <label className="text-sm font-medium">Priority<select name="priority" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">{TASK_PRIORITIES.map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}</select></label>
              <label className="text-sm font-medium">Assignee<select name="assignee_id" className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"><option value="">Unassigned</option>{agencyMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.email}</option>)}</select></label>
              <label className="text-sm font-medium">List<select name="task_list_id" required defaultValue={lists.find((list) => list.kind === "recurring")?.id} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
              <label className="text-sm font-medium md:col-span-2 xl:col-span-4">Description<textarea name="description" rows={3} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" /></label>
              <button className="w-fit rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Create rule</button>
            </form>
          </details>
          {!rules?.length ? <EmptyState title="No recurring rules" description="Rules create one due task at a time when the protected cron route runs." /> : (
            <div className="overflow-hidden rounded-xl border bg-white">
              <table className="w-full text-left text-sm"><thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="px-4 py-3">Rule</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Next run</th><th className="px-4 py-3">Active</th></tr></thead>
                <tbody className="divide-y">{rules.map((rule) => <tr key={rule.id}><td className="px-4 py-3 font-medium">{rule.title}</td><td className="px-4 py-3">Every {rule.interval_count} {rule.frequency}</td><td className="px-4 py-3">{rule.next_run_at}</td><td className="px-4 py-3">{rule.active ? "Yes" : "No"}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "onboarding" && (
        <div className="space-y-5">
          <form action={generateOnboardingLink}>
            <input type="hidden" name="client_id" value={clientId} />
            <button className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white">Generate onboarding link</button>
          </form>
          <section>
            <h2 className="mb-3 text-sm font-semibold">Links</h2>
            <div className="space-y-2">
              {!links?.length && <EmptyState title="No onboarding links" description="Generate a tokenized public link for this client." />}
              {links?.map((link) => {
                const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
                return <div key={link.id} className="rounded-xl border bg-white p-4"><Link className="break-all text-sm font-medium underline" href={`/onboarding/${link.token}`} target="_blank">{appUrl}/onboarding/{link.token}</Link><p className="mt-1 text-xs text-zinc-500">{link.active ? "Active" : "Inactive"} · created {new Date(link.created_at).toLocaleString()}</p></div>;
              })}
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold">Submissions</h2>
            <div className="space-y-3">
              {!submissions?.length && <EmptyState title="No submissions" description="Completed onboarding forms will appear here." />}
              {submissions?.map((submission) => <details key={submission.id} className="rounded-xl border bg-white"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">Submitted {new Date(submission.submitted_at).toLocaleString()} {submission.reviewed_at ? "· Reviewed" : ""}</summary><div className="border-t p-4"><pre className="max-h-96 overflow-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100">{JSON.stringify(submission.submission, null, 2)}</pre><form action={copyOnboardingToDossier} className="mt-3"><input type="hidden" name="client_id" value={clientId} /><input type="hidden" name="submission_id" value={submission.id} /><button className="rounded-lg border px-3 py-2 text-sm font-medium">Copy into dossier</button></form></div></details>)}
            </div>
          </section>
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-2">
          {!activity?.length && <EmptyState title="No activity yet" description="Major client actions will be recorded here." />}
          {activity?.map((item) => <div key={item.id} className="rounded-xl border bg-white px-4 py-3"><div className="flex items-center justify-between gap-4"><p className="text-sm font-medium">{formatLabel(item.action.replaceAll(".", " "))}</p><time className="text-xs text-zinc-400">{new Date(item.created_at).toLocaleString()}</time></div>{Object.keys(item.metadata ?? {}).length > 0 && <p className="mt-1 text-xs text-zinc-500">{JSON.stringify(item.metadata)}</p>}</div>)}
        </div>
      )}
    </>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: readonly string[];
}) {
  return (
    <label className="text-xs font-medium text-zinc-500">
      {label}
      <select name={name} defaultValue={value ?? ""} className="mt-1 block rounded-lg border px-3 py-2 text-sm text-zinc-900">
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{formatLabel(option)}</option>)}
      </select>
    </label>
  );
}
