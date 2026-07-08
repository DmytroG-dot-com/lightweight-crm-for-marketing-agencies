import Link from "next/link";
import { redirect } from "next/navigation";
import { ListFilter, X } from "lucide-react";
import {
  archiveTaskList,
  copyOnboardingToDossier,
  deleteTaskList,
  generateOnboardingLink,
  setOnboardingLinkActive,
  updateClient,
} from "@/actions/crm";
import { ClientTabs } from "@/components/client-tabs";
import { ClientLifecycleActions } from "@/components/client-lifecycle-actions";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { DossierForm } from "@/components/dossier-form";
import { DossierExportButton } from "@/components/dossier-export-button";
import { EmptyState } from "@/components/empty-state";
import { InlineTaskListCreator } from "@/components/inline-task-list-creator";
import { PageHeader } from "@/components/page-header";
import { PersonaManager } from "@/components/persona-manager";
import { QuickTaskComposer } from "@/components/quick-task-composer";
import { RecurringScheduleManager } from "@/components/recurring-schedule-manager";
import { StatusPill } from "@/components/status-pill";
import { TaskCsvImporter } from "@/components/task-csv-importer";
import { TaskTemplateControls } from "@/components/task-template-controls";
import { TaskRestoreAction } from "@/components/task-restore-action";
import { type List, type Member, type Task, TaskTable } from "@/components/task-table";
import type { LinkedCreativeRequest, TaskReference } from "@/components/task-detail-modal";
import { requireClient } from "@/lib/auth";
import { getAgencyAiSettingsSummary } from "@/lib/ai/settings";
import { DEFAULT_ONBOARDING_TEMPLATE_NAME } from "@/lib/onboarding";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { TASK_REFERENCE_SELECT, TASK_SUMMARY_SELECT } from "@/lib/task-selects";
import { addDaysToDateValue, dateInputValue, formatDateTime, formatLabel } from "@/lib/utils";

type Search = {
  tab?: string;
  status?: string;
  assignee?: string;
  priority?: string;
  due?: string;
  list?: string;
  task?: string;
};

function buildTasklessClientHref(clientId: string, filters: Search) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (!value || key === "task") continue;
    params.set(key, value);
  }
  const query = params.toString();
  return query ? `/clients/${clientId}?${query}` : `/clients/${clientId}`;
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Search>;
}) {
  const { clientId } = await params;
  const filters = await searchParams;
  const context = await requireClient(clientId);
  const today = dateInputValue(new Date(), context.membership.timezone);
  const archived = context.client.status === "archived";
  const legacyRecurringTab = filters.tab === "recurring";
  const requestedTab = legacyRecurringTab ? "tasks" : filters.tab ?? "tasks";
  const tab = archived && requestedTab !== "overview" && requestedTab !== "activity"
    ? "overview"
    : requestedTab;
  const canManageLifecycle = context.membership.role === "owner" || context.membership.role === "admin";
  const needsLists = tab === "tasks";
  const { data: taskLists, error: taskListsError } = needsLists
    ? await context.supabase
      .from("task_lists")
      .select("id, name, kind")
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
      .is("archived_at", null)
      .order("created_at")
    : { data: [], error: null };
  if (taskListsError) throw new Error(taskListsError.message);
  const lists = (taskLists ?? []) as List[];
  const requestedList = legacyRecurringTab ? "recurring" : filters.list ?? "general";
  const selectedList = lists.find((list) =>
    requestedList === "general" || requestedList === "recurring"
      ? list.kind === requestedList
      : list.id === requestedList,
  ) ?? lists.find((list) => list.kind === "general");

  let taskQuery = context.supabase
    .from("tasks")
    .select(TASK_SUMMARY_SELECT)
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (selectedList) taskQuery = taskQuery.eq("task_list_id", selectedList.id);
  if (filters.status) taskQuery = taskQuery.eq("status", filters.status);
  else taskQuery = taskQuery.neq("status", "complete");
  if (filters.assignee) taskQuery = taskQuery.eq("assignee_id", filters.assignee);
  if (filters.priority) taskQuery = taskQuery.eq("priority", filters.priority);
  if (filters.due === "overdue") taskQuery = taskQuery.lt("due_date", today);
  if (filters.due === "today") taskQuery = taskQuery.eq("due_date", today);
  if (filters.due === "week") taskQuery = taskQuery.lte("due_date", addDaysToDateValue(today, 7));

  const membersQuery = tab === "tasks" || tab === "activity"
    ? context.supabase.from("agency_members").select("user_id, display_name, email").eq("agency_id", context.agency.id).order("display_name")
    : Promise.resolve({ data: [], error: null });
  const tasksQuery = tab === "tasks" ? taskQuery : Promise.resolve({ data: [], error: null });
  const focusedTaskQuery = tab === "tasks" && filters.task
    ? context.supabase
      .from("tasks")
      .select(TASK_SUMMARY_SELECT)
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
      .eq("id", filters.task)
      .is("archived_at", null)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const taskReferencesQuery = tab === "tasks"
    ? context.supabase
      .from("tasks")
      .select(TASK_REFERENCE_SELECT)
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
    : Promise.resolve({ data: [], error: null });
  const creativeLinksQuery = tab === "tasks"
    ? context.supabase
      .from("creative_requests")
      .select("id, client_id, title, status, due_date, source_task_id, archived_at")
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
    : Promise.resolve({ data: [], error: null });
  const templatesQuery = tab === "tasks" && selectedList?.kind !== "recurring"
    ? context.supabase
      .from("task_templates")
      .select("id, name, description")
      .eq("agency_id", context.agency.id)
      .order("name")
    : Promise.resolve({ data: [], error: null });
  const dossierQuery = tab === "dossier"
    ? context.supabase.from("dossiers").select("*").eq("agency_id", context.agency.id).eq("client_id", clientId).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const personasQuery = tab === "dossier"
    ? context.supabase
      .from("client_personas")
      .select("*")
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("created_at")
    : Promise.resolve({ data: [], error: null });
  const rulesQuery = tab === "tasks" && selectedList?.kind === "recurring"
    ? context.supabase.from("recurring_task_rules").select("*").eq("agency_id", context.agency.id).eq("client_id", clientId).eq("task_list_id", selectedList.id).order("next_run_at")
    : Promise.resolve({ data: [], error: null });
  const linksQuery = tab === "onboarding"
    ? context.supabase.from("onboarding_links").select("*").eq("agency_id", context.agency.id).eq("client_id", clientId).order("created_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const onboardingTemplatesQuery = tab === "onboarding"
    ? context.supabase
      .from("onboarding_templates")
      .select("id, name, is_default")
      .eq("agency_id", context.agency.id)
      .order("is_default", { ascending: false })
      .order("created_at")
    : Promise.resolve({ data: [], error: null });
  const submissionsQuery = tab === "onboarding"
    ? context.supabase.from("onboarding_submissions").select("*").eq("agency_id", context.agency.id).eq("client_id", clientId).order("submitted_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const activityQuery = tab === "activity"
    ? context.supabase.from("activity_logs").select("*").eq("agency_id", context.agency.id).eq("client_id", clientId).order("created_at", { ascending: false }).limit(100)
    : Promise.resolve({ data: [], error: null });
  const aiSettingsQuery = tab === "tasks" && selectedList?.kind !== "recurring"
    ? getAgencyAiSettingsSummary(context.agency.id)
    : Promise.resolve({ provider: "openai" as const, model: "", imageModel: "", enabled: false, configured: false, usesServerKey: false });

  const [
    { data: members, error: membersError },
    { data: tasks, error: tasksError },
    { data: focusedTask, error: focusedTaskError },
    { data: taskReferences, error: taskReferencesError },
    { data: creativeLinks, error: creativeLinksError },
    { data: templates, error: templatesError },
    { data: dossier, error: dossierError },
    { data: personas, error: personasError },
    { data: rules, error: rulesError },
    { data: links, error: linksError },
    { data: onboardingTemplates, error: onboardingTemplatesError },
    { data: submissions, error: submissionsError },
    { data: activity, error: activityError },
    aiSettings,
  ] = await Promise.all([
    membersQuery,
    tasksQuery,
    focusedTaskQuery,
    taskReferencesQuery,
    creativeLinksQuery,
    templatesQuery,
    dossierQuery,
    personasQuery,
    rulesQuery,
    linksQuery,
    onboardingTemplatesQuery,
    submissionsQuery,
    activityQuery,
    aiSettingsQuery,
  ]);
  const queryError = membersError || tasksError || focusedTaskError || taskReferencesError || creativeLinksError || templatesError || dossierError || personasError || rulesError || linksError || onboardingTemplatesError || submissionsError || activityError;
  if (queryError) throw new Error(queryError.message);

  const agencyMembers = (members ?? []) as unknown as Member[];
  const clientTasks = (tasks ?? []) as unknown as Task[];
  const clientTaskReferences = (taskReferences ?? []) as unknown as TaskReference[];
  const clientCreativeLinks = (creativeLinks ?? []) as unknown as LinkedCreativeRequest[];
  const focusedTaskRecord = focusedTask as unknown as Task | null;
  if (tab === "tasks" && filters.task && !focusedTaskRecord) {
    redirect(buildTasklessClientHref(clientId, filters));
  }
  if (focusedTaskRecord && !clientTasks.some((task) => task.id === focusedTaskRecord.id)) {
    clientTasks.push(focusedTaskRecord);
  }
  const selectedListParam = selectedList?.kind === "general" || selectedList?.kind === "recurring"
    ? selectedList.kind
    : selectedList?.id ?? "general";
  const hasTaskFilters = Boolean(filters.status || filters.assignee || filters.priority || filters.due);

  return (
    <>
      <PageHeader
        title={context.client.name}
        description={context.client.company_name || context.client.contact_email || "Client workspace"}
        actions={<StatusPill value={context.client.status} />}
      />
      {archived && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-y border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-xs leading-5 text-amber-900">
            This client workspace is archived. Its tasks, recurring work, and public onboarding links are inactive until restored.
          </p>
          {canManageLifecycle && <ClientLifecycleActions clientId={clientId} archived />}
        </div>
      )}
      <ClientTabs clientId={clientId} active={tab} archived={archived} />

      {tab === "overview" && (
        <form action={updateClient} className="grid gap-x-5 gap-y-6 border-y bg-white py-6 md:grid-cols-2 xl:grid-cols-3">
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
              <input name={String(name)} disabled={archived} required={name === "name"} defaultValue={String(value ?? "")} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-500" />
            </label>
          ))}
          <label className="text-sm font-medium">
            Status
            <select name="status" disabled={archived} defaultValue={context.client.status} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-500">
              <option value="active">Active</option><option value="paused">Paused</option>{archived && <option value="archived">Archived</option>}
            </select>
          </label>
          <label className="text-sm font-medium md:col-span-2 xl:col-span-3">
            Notes
            <textarea name="notes" disabled={archived} rows={5} defaultValue={context.client.notes ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-500" />
          </label>
          {!archived && <button className="ui-action ui-action-primary w-fit">Save client</button>}
          {!archived && canManageLifecycle && (
            <div className="flex justify-end border-t border-zinc-100 pt-4 md:col-span-2 xl:col-span-3">
              <ClientLifecycleActions clientId={clientId} archived={false} />
            </div>
          )}
        </form>
      )}

      {tab === "tasks" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-6 border-b">
            {lists.map((list) => {
              const listParam = list.kind === "general" || list.kind === "recurring" ? list.kind : list.id;
              const active = selectedList?.id === list.id;
              return (
                <Link
                  key={list.id}
                  href={`/clients/${clientId}?tab=tasks&list=${listParam}`}
                  className={`border-b px-0 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] ${active ? "border-zinc-950 text-zinc-950" : "border-transparent text-zinc-400 hover:text-zinc-950"}`}
                >
                  {list.name}
                </Link>
              );
            })}
            <InlineTaskListCreator clientId={clientId} />
            <TaskCsvImporter
              clientId={clientId}
              taskListId={selectedList?.kind !== "recurring" ? selectedList?.id : null}
            />
            {selectedList && selectedList.kind !== "recurring" && (
              <TaskTemplateControls
                clientId={clientId}
                taskListId={selectedList.id}
                taskListName={selectedList.name}
                canSaveCurrentList={selectedList.kind === "custom"}
                templates={(templates ?? []) as Array<{ id: string; name: string; description: string | null }>}
              />
            )}
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
          {selectedList?.kind === "recurring" ? (
            <RecurringScheduleManager
              key={(rules ?? []).map((rule) => rule.id).join(",") || "no-recurring-rules"}
              clientId={clientId}
              recurringListId={selectedList.id}
              members={agencyMembers}
              rules={rules ?? []}
              today={today}
            />
          ) : selectedList ? (
            <QuickTaskComposer
              currentClientId={clientId}
              currentListId={selectedList.id}
              aiConfigured={aiSettings.enabled && aiSettings.configured}
              autoFocus={!filters.task}
            />
          ) : null}
          <div className="flex flex-col gap-3 border-b border-zinc-200 pb-3 xl:flex-row xl:items-center xl:justify-between">
            <AutoFilterForm className="ui-filter-bar">
              <input type="hidden" name="tab" value="tasks" />
              <input type="hidden" name="list" value={selectedListParam} />
              <ListFilter className="ui-filter-icon" aria-hidden="true" />
              <FilterSelect name="status" label="Status" value={filters.status} options={TASK_STATUSES} emptyLabel="All open" />
              <FilterSelect name="priority" label="Priority" value={filters.priority} options={TASK_PRIORITIES} />
              <label className="ui-filter-field" data-active={Boolean(filters.assignee)}>
                <span>Assignee</span>
                <select name="assignee" defaultValue={filters.assignee ?? ""}>
                  <option value="">All</option>
                  {agencyMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.email}</option>)}
                </select>
              </label>
              <label className="ui-filter-field" data-active={Boolean(filters.due)}>
                <span>Due</span>
                <select name="due" defaultValue={filters.due ?? ""}>
                  <option value="">Any</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="week">Next 7 days</option>
                </select>
              </label>
              {hasTaskFilters && (
                <Link href={`/clients/${clientId}?tab=tasks&list=${selectedListParam}`} className="ui-filter-clear">
                  <X className="size-3" />Clear
                </Link>
              )}
            </AutoFilterForm>
          </div>
          <TaskTable tasks={clientTasks} taskReferences={clientTaskReferences} creativeRequests={clientCreativeLinks} lists={lists} members={agencyMembers} agencyId={context.agency.id} currentUserId={context.user.id} currentUserRole={context.membership.role} timezone={context.membership.timezone} focusedTaskId={filters.task} />
        </div>
      )}

      {tab === "dossier" && (
        <>
          <DossierExportButton clientId={clientId} />
          <DossierForm clientId={clientId} dossier={dossier} />
          <PersonaManager clientId={clientId} personas={personas ?? []} />
        </>
      )}

      {tab === "onboarding" && (
        <div className="space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-950 pb-4">
            <div>
              <h2 className="ui-section-title">Onboarding history</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
              Generate a new form whenever client context needs refreshing. Archive old forms to disable their public links while keeping submissions available here.
              </p>
            </div>
            <form action={generateOnboardingLink} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="client_id" value={clientId} />
              <label className="block text-sm font-medium">
                <span className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-zinc-500">Template</span>
                <select
                  name="template_id"
                  defaultValue={(onboardingTemplates ?? []).find((template) => template.is_default)?.id ?? ""}
                  className="min-w-[240px] rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">{DEFAULT_ONBOARDING_TEMPLATE_NAME}</option>
                  {(onboardingTemplates ?? []).map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}{template.is_default ? " · default" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button className="ui-action ui-action-primary w-full sm:w-auto">Generate new onboarding form</button>
            </form>
          </div>
          <section>
            <h2 className="ui-section-title mb-3">Forms and public links</h2>
            <div className="space-y-2">
              {!links?.length && <EmptyState title="No onboarding links" description="Generate a tokenized public link for this client." />}
              {links?.map((link) => {
                const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
                const submission = submissions?.find((item) => item.onboarding_link_id === link.id);
                return (
                  <div key={link.id} className={`border-y bg-white px-4 py-3 ${link.active ? "" : "opacity-65"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${link.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-zinc-100 text-zinc-500"}`}>
                            {link.active ? "Active" : "Archived"}
                          </span>
                          <span className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                            {typeof link.template_name === "string" && link.template_name.trim() ? link.template_name : DEFAULT_ONBOARDING_TEMPLATE_NAME}
                          </span>
                          <span className="text-[10px] uppercase tracking-[0.06em] text-zinc-400">
                            {submission ? `Submitted ${formatDateTime(submission.submitted_at, context.membership.timezone)}` : "Awaiting submission"}
                          </span>
                        </div>
                        <Link className="mt-2 block break-all text-xs text-blue-700 underline" href={`/onboarding/${link.token}`} target="_blank">
                          {appUrl}/onboarding/{link.token}
                        </Link>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.06em] text-zinc-400">Created {formatDateTime(link.created_at, context.membership.timezone)}</p>
                      </div>
                      <form action={setOnboardingLinkActive}>
                        <input type="hidden" name="client_id" value={clientId} />
                        <input type="hidden" name="link_id" value={link.id} />
                        <input type="hidden" name="active" value={String(!link.active)} />
                        <button className="ui-action">{link.active ? "Archive form" : "Unarchive form"}</button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section>
            <div className="mb-3 border-b border-zinc-950 pb-3">
              <h2 className="ui-section-title">Submitted responses</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
                “Merge answers into dossier” copies non-empty structured answers into the client dossier. Existing research fields and the AI summary are preserved.
              </p>
            </div>
            <div className="space-y-3">
              {!submissions?.length && <EmptyState title="No submissions" description="Completed onboarding forms will appear here." />}
              {submissions?.map((submission) => {
                const form = links?.find((link) => link.id === submission.onboarding_link_id);
                return (
                  <details key={submission.id} className="border-y bg-white">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                      Submitted {formatDateTime(submission.submitted_at, context.membership.timezone)}
                      {submission.reviewed_at ? " · Merged into dossier" : ""}
                      {form && !form.active ? " · Archived form" : ""}
                    </summary>
                    <div className="border-t p-4">
                      <pre className="max-h-96 overflow-auto bg-zinc-950 p-4 text-xs text-zinc-100">{JSON.stringify(submission.submission, null, 2)}</pre>
                      <form action={copyOnboardingToDossier} className="mt-3">
                        <input type="hidden" name="client_id" value={clientId} />
                        <input type="hidden" name="submission_id" value={submission.id} />
                        <button className="ui-action">{submission.reviewed_at ? "Merge into dossier again" : "Merge answers into dossier"}</button>
                      </form>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-2">
          {!activity?.length && <EmptyState title="No activity yet" description="Major client actions will be recorded here." />}
          {activity?.map((item) => {
            const actor = item.actor_id ? agencyMembers.find((member) => member.user_id === item.actor_id) : null;
            return <div key={item.id} className="border-y bg-white px-4 py-3"><div className="flex items-center justify-between gap-4"><p className="text-sm font-medium">{formatLabel(item.action.replaceAll(".", " "))}</p><time dateTime={item.created_at} className="text-xs text-zinc-400">{formatDateTime(item.created_at, context.membership.timezone)}</time></div><p className="mt-1 text-[10px] uppercase tracking-[0.06em] text-blue-700">By {actor?.display_name || actor?.email || (item.actor_id ? "Former member" : "System")}</p>{item.metadata?.title && <p className="mt-1 text-xs text-zinc-500">{String(item.metadata.title)}</p>}{item.action === "task.archived" && item.entity_id && <div className="mt-3"><TaskRestoreAction clientId={clientId} taskId={item.entity_id} /></div>}</div>;
          })}
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
  emptyLabel = "All",
}: {
  name: string;
  label: string;
  value?: string;
  options: readonly string[];
  emptyLabel?: string;
}) {
  return (
    <label className="ui-filter-field" data-active={Boolean(value)}>
      <span>{label}</span>
      <select name={name} defaultValue={value ?? ""}>
        <option value="">{emptyLabel}</option>
        {options.map((option) => <option key={option} value={option}>{formatLabel(option)}</option>)}
      </select>
    </label>
  );
}
