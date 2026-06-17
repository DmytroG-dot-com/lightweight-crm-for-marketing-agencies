import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCheck,
  ListTodo,
  MessageSquareText,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { AiTeamReportGenerator } from "@/components/ai-team-report-generator";
import { PageHeader } from "@/components/page-header";
import { type List, type Member, type Task, TaskTable } from "@/components/task-table";
import type { TaskReference } from "@/components/task-detail-modal";
import type { AiTeamReport } from "@/lib/ai/team-report";
import { requireAgencyAdmin, type AgencyContext } from "@/lib/auth";
import { TASK_REFERENCE_SELECT } from "@/lib/task-selects";
import { formatDate, formatDateTime } from "@/lib/utils";

type TeamView = "overview" | "work" | "completed";
type TeamSearch = { view?: string; range?: string; report?: string };

type DashboardMetrics = {
  totals: {
    open_tasks: number;
    overdue_tasks: number;
    completed_tasks: number;
    comments_added: number;
    activity_count: number;
  };
  clients: Array<{
    id: string;
    name: string;
    open_tasks: number;
    completed_tasks: number;
    activity_count: number;
  }>;
  assignees: Array<{
    user_id: string;
    name: string;
    open_tasks: number;
    overdue_tasks: number;
    completed_tasks: number;
    comments_added: number;
  }>;
};

type CompletedTask = {
  id: string;
  client_id: string;
  task_list_id: string;
  title: string;
  completed_at: string;
  completed_assignee_id: string | null;
  clients: { name: string } | null;
};

type SavedReport = {
  id: string;
  period_key: string;
  period_start: string;
  period_end: string;
  focus: string | null;
  report: AiTeamReport;
  model: string;
  created_at: string;
};

type ReportTask = { id: string; title: string; client_id: string; task_list_id: string };
type ReportClient = { id: string; name: string };

export default async function TeamPage({ searchParams }: { searchParams: Promise<TeamSearch> }) {
  const query = await searchParams;
  const view: TeamView = query.view === "work" || query.view === "completed" ? query.view : "overview";
  const context = await requireAgencyAdmin();
  const { data: rawMembers, error: membersError } = await context.supabase
    .from("agency_members")
    .select("user_id, display_name, email")
    .eq("agency_id", context.agency.id)
    .order("display_name");
  if (membersError) throw new Error(membersError.message);
  const members = (rawMembers ?? []) as unknown as Member[];

  const content = view === "work"
    ? await WorkloadView({ context, members })
    : view === "completed"
      ? await CompletedView({ context, members })
      : await OverviewView({ context, range: query.range, reportId: query.report });

  return (
    <>
      <PageHeader title="Team" description="Workload, output, and client activity." />
      <nav className="mb-10 flex flex-wrap gap-6 border-b">
        <TeamTab href="/team" active={view === "overview"}>Overview</TeamTab>
        <TeamTab href="/team?view=work" active={view === "work"}>Open work</TeamTab>
        <TeamTab href="/team?view=completed" active={view === "completed"}>Completed</TeamTab>
      </nav>
      {content}
    </>
  );
}

async function OverviewView({ context, range, reportId }: { context: AgencyContext; range?: string; reportId?: string }) {
  const rangeDays = range === "30" || range === "90" ? Number(range) : 7;
  const rangeStart = new Date();
  rangeStart.setUTCDate(rangeStart.getUTCDate() - rangeDays);
  const [
    { data, error },
    { data: rawReports, error: reportsError },
  ] = await Promise.all([
    context.supabase.rpc("get_team_dashboard_metrics", {
      target_agency_id: context.agency.id,
      range_start: rangeStart.toISOString(),
    }),
    context.supabase
      .from("ai_team_reports")
      .select("id, period_key, period_start, period_end, focus, report, model, created_at")
      .eq("agency_id", context.agency.id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  if (error || reportsError) throw new Error((error || reportsError)?.message);
  const metrics = data as DashboardMetrics;
  const reports = (rawReports ?? []) as unknown as SavedReport[];
  const selectedReport = reports.find((report) => report.id === reportId) ?? reports[0] ?? null;
  const evidenceTaskIds = selectedReport ? reportEvidenceIds(selectedReport.report, "task_ids") : [];
  const evidenceClientIds = selectedReport ? reportEvidenceIds(selectedReport.report, "client_ids") : [];
  const [
    { data: rawEvidenceTasks, error: evidenceTasksError },
    { data: rawEvidenceClients, error: evidenceClientsError },
  ] = await Promise.all([
    evidenceTaskIds.length
      ? context.supabase
        .from("tasks")
        .select("id, title, client_id, task_list_id")
        .eq("agency_id", context.agency.id)
        .in("id", evidenceTaskIds)
      : Promise.resolve({ data: [], error: null }),
    evidenceClientIds.length
      ? context.supabase
        .from("clients")
        .select("id, name")
        .eq("agency_id", context.agency.id)
        .in("id", evidenceClientIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (evidenceTasksError || evidenceClientsError) throw new Error((evidenceTasksError || evidenceClientsError)?.message);
  const evidenceTasks = (rawEvidenceTasks ?? []) as ReportTask[];
  const evidenceClients = (rawEvidenceClients ?? []) as ReportClient[];
  const maxClientOpen = Math.max(1, ...metrics.clients.map((client) => client.open_tasks));
  const maxAssigneeOpen = Math.max(1, ...metrics.assignees.map((assignee) => assignee.open_tasks));

  return (
    <div className="space-y-12">
      <section id="ai-report" className="scroll-mt-8">
        <SectionHeading icon={Sparkles} title="AI report" description="A saved management brief generated from exact CRM metrics and linked task evidence." />
        <AiTeamReportGenerator />
        {selectedReport ? (
          <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_230px]">
            <AiReportView report={selectedReport} tasks={evidenceTasks} clients={evidenceClients} timezone={context.membership.timezone} />
            <aside>
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-400">Saved reports</p>
              <div className="border-y bg-white">
                {reports.map((report) => (
                  <Link
                    key={report.id}
                    href={`/team?report=${report.id}#ai-report`}
                    className={`block border-b px-3 py-3 last:border-0 ${selectedReport.id === report.id ? "bg-blue-50 text-blue-800" : "hover:bg-zinc-50"}`}
                  >
                    <span className="block text-xs font-medium">{periodLabel(report.period_key)}</span>
                    <span className="mt-1 block text-[9px] uppercase tracking-[0.05em] text-zinc-400">{formatDateTime(report.created_at, context.membership.timezone)}</span>
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        ) : (
          <p className="mt-4 border-y bg-white py-4 text-xs text-zinc-400">No saved AI reports yet.</p>
        )}
      </section>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-xs text-zinc-500">Output from {formatDate(rangeStart)} through today.</p>
        <div className="flex gap-1">
          {[7, 30, 90].map((days) => (
            <Link
              key={days}
              href={`/team?range=${days}`}
              className={`border px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                rangeDays === days ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-200 text-zinc-500 hover:border-zinc-950 hover:text-zinc-950"
              }`}
            >
              {days} days
            </Link>
          ))}
        </div>
      </div>

      <section className="grid gap-px border border-zinc-950 bg-zinc-950 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={ListTodo} label="Open tasks" value={metrics.totals.open_tasks} />
        <MetricCard icon={AlertTriangle} label="Overdue" value={metrics.totals.overdue_tasks} tone="danger" />
        <MetricCard icon={CheckCheck} label="Completed" value={metrics.totals.completed_tasks} tone="success" />
        <MetricCard icon={MessageSquareText} label="Comments" value={metrics.totals.comments_added} />
        <MetricCard icon={Activity} label="Activity" value={metrics.totals.activity_count} />
      </section>

      <section>
        <SectionHeading icon={Building2} title="Client workload" description="Open tasks plus output and activity during the selected period." />
        <div className="overflow-x-auto border-y border-zinc-950 bg-white">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b text-[9px] uppercase tracking-[0.12em] text-zinc-400">
              <tr><th className="px-4 py-3">Client</th><th className="px-4 py-3">Workload</th><th className="px-4 py-3 text-right">Open</th><th className="px-4 py-3 text-right">Completed</th><th className="px-4 py-3 text-right">Activity</th></tr>
            </thead>
            <tbody className="divide-y">
              {metrics.clients.map((client) => (
                <tr key={client.id}>
                  <td className="px-4 py-3"><Link href={`/clients/${client.id}?tab=tasks&list=general`} className="font-medium hover:text-blue-700 hover:underline">{client.name}</Link></td>
                  <td className="w-56 px-4 py-3"><MetricBar value={client.open_tasks} max={maxClientOpen} /></td>
                  <td className="px-4 py-3 text-right font-mono">{client.open_tasks}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700">{client.completed_tasks}</td>
                  <td className="px-4 py-3 text-right font-mono">{client.activity_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeading icon={UsersRound} title="Assignee workload" description="Current workload plus completed tasks and comments during the selected period." />
        <div className="overflow-x-auto border-y border-zinc-950 bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b text-[9px] uppercase tracking-[0.12em] text-zinc-400">
              <tr><th className="px-4 py-3">Assignee</th><th className="px-4 py-3">Workload</th><th className="px-4 py-3 text-right">Open</th><th className="px-4 py-3 text-right">Overdue</th><th className="px-4 py-3 text-right">Completed</th><th className="px-4 py-3 text-right">Comments</th></tr>
            </thead>
            <tbody className="divide-y">
              {metrics.assignees.map((assignee) => (
                <tr key={assignee.user_id}>
                  <td className="px-4 py-3"><Link href={`/team?view=work#member-${assignee.user_id}`} className="font-medium hover:text-blue-700 hover:underline">{assignee.name}</Link></td>
                  <td className="w-56 px-4 py-3"><MetricBar value={assignee.open_tasks} max={maxAssigneeOpen} /></td>
                  <td className="px-4 py-3 text-right font-mono">{assignee.open_tasks}</td>
                  <td className={`px-4 py-3 text-right font-mono ${assignee.overdue_tasks ? "text-red-700" : ""}`}>{assignee.overdue_tasks}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700">{assignee.completed_tasks}</td>
                  <td className="px-4 py-3 text-right font-mono">{assignee.comments_added}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AiReportView({ report, tasks, clients, timezone }: { report: SavedReport; tasks: ReportTask[]; clients: ReportClient[]; timezone: string }) {
  return (
    <article className="border-y border-zinc-950 bg-white py-5">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-blue-700">{periodLabel(report.period_key)}</p>
          <p className="mt-1 text-[10px] text-zinc-400">{formatDate(report.period_start)} to {formatDate(reportInclusiveEnd(report.period_end))} · {report.model}</p>
        </div>
        <time dateTime={report.created_at} className="text-[9px] uppercase tracking-[0.05em] text-zinc-400">{formatDateTime(report.created_at, timezone)}</time>
      </div>
      <h3 className="text-lg font-medium tracking-[-0.03em]">Executive summary</h3>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{report.report.executive_summary}</p>
      {report.focus && <p className="mt-4 border-l-2 border-blue-600 pl-3 text-xs text-zinc-500">Focus: {report.focus}</p>}
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <ReportItems title="Wins" tone="success" items={report.report.wins} tasks={tasks} clients={clients} />
        <ReportItems title="Risks" tone="danger" items={report.report.risks} tasks={tasks} clients={clients} />
        <ReportItems title="Recommendations" tone="default" items={report.report.recommendations} tasks={tasks} clients={clients} />
      </div>
    </article>
  );
}

function ReportItems({
  title,
  tone,
  items,
  tasks,
  clients,
}: {
  title: string;
  tone: "default" | "danger" | "success";
  items: AiTeamReport["wins"];
  tasks: ReportTask[];
  clients: ReportClient[];
}) {
  const toneClass = tone === "danger" ? "text-red-700" : tone === "success" ? "text-emerald-700" : "text-blue-700";
  return (
    <section>
      <h4 className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${toneClass}`}>{title}</h4>
      <div className="mt-3 space-y-5">
        {items.length ? items.map((item, index) => (
          <div key={`${item.title}-${index}`} className="border-t pt-3">
            <p className="text-sm font-medium">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{item.detail}</p>
            <EvidenceLinks item={item} tasks={tasks} clients={clients} />
          </div>
        )) : <p className="text-xs text-zinc-400">None identified.</p>}
      </div>
    </section>
  );
}

function EvidenceLinks({ item, tasks, clients }: { item: AiTeamReport["wins"][number]; tasks: ReportTask[]; clients: ReportClient[] }) {
  const linkedTasks = item.task_ids.flatMap((id) => tasks.filter((task) => task.id === id));
  const linkedClients = item.client_ids.flatMap((id) => clients.filter((client) => client.id === id));
  if (!linkedTasks.length && !linkedClients.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-semibold uppercase tracking-[0.05em]">
      {linkedTasks.map((task) => <Link key={task.id} href={`/clients/${task.client_id}?tab=tasks&list=${task.task_list_id}&task=${task.id}`} className="text-blue-700 hover:underline">{task.title}</Link>)}
      {linkedClients.map((client) => <Link key={client.id} href={`/clients/${client.id}?tab=tasks&list=general`} className="text-violet-700 hover:underline">{client.name}</Link>)}
    </div>
  );
}

async function WorkloadView({ context, members }: { context: AgencyContext; members: Member[] }) {
  const [{ data: rawTasks, error: tasksError }, { data: rawLists, error: listsError }] = await Promise.all([
    context.supabase
      .from("tasks")
      .select("id, client_id, share_code, title, status, priority, assignee_id, task_list_id, parent_task_id, source_recurring_rule_id, start_date, due_date, clients!inner(name, status)")
      .eq("agency_id", context.agency.id)
      .neq("clients.status", "archived")
      .is("archived_at", null)
      .neq("status", "complete")
      .order("due_date", { ascending: true, nullsFirst: false }),
    context.supabase
      .from("task_lists")
      .select("id, name, kind, client_id")
      .eq("agency_id", context.agency.id)
      .is("archived_at", null),
  ]);
  const queryError = tasksError || listsError;
  if (queryError) throw new Error(queryError.message);
  const tasks = (rawTasks ?? []) as unknown as Task[];
  const clientIds = [...new Set(tasks.map((task) => task.client_id))];
  const { data: rawReferences, error: referencesError } = clientIds.length
    ? await context.supabase
      .from("tasks")
      .select(TASK_REFERENCE_SELECT)
      .eq("agency_id", context.agency.id)
      .in("client_id", clientIds)
    : { data: [], error: null };
  if (referencesError) throw new Error(referencesError.message);
  const lists = (rawLists ?? []) as unknown as List[];
  const references = (rawReferences ?? []) as unknown as TaskReference[];
  const unassigned = tasks.filter((task) => !task.assignee_id);

  return (
    <div className="space-y-14">
      {members.map((member) => {
        const memberTasks = tasks.filter((task) => task.assignee_id === member.user_id);
        return (
          <AssigneeTaskSection
            key={member.user_id}
            id={`member-${member.user_id}`}
            title={memberLabel(member)}
            tasks={memberTasks}
            lists={lists}
            members={members}
            references={references}
            context={context}
          />
        );
      })}
      {!!unassigned.length && (
        <AssigneeTaskSection
          id="unassigned"
          title="Unassigned"
          tasks={unassigned}
          lists={lists}
          members={members}
          references={references}
          context={context}
        />
      )}
    </div>
  );
}

async function CompletedView({ context, members }: { context: AgencyContext; members: Member[] }) {
  const thisWeekStart = startOfUtcWeek(new Date());
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);

  const { data, error } = await context.supabase
    .from("tasks")
    .select("id, client_id, task_list_id, title, completed_at, completed_assignee_id, clients!inner(name, status)")
    .eq("agency_id", context.agency.id)
    .eq("status", "complete")
    .neq("clients.status", "archived")
    .is("archived_at", null)
    .gte("completed_at", lastWeekStart.toISOString())
    .lt("completed_at", nextWeekStart.toISOString())
    .order("completed_at", { ascending: false });
  if (error) throw new Error(error.message);
  const tasks = (data ?? []) as unknown as CompletedTask[];
  const unassigned = tasks.filter((task) => !task.completed_assignee_id);

  return (
    <div className="space-y-12">
      <p className="text-xs text-zinc-500">Weeks run Monday through Sunday. Completion is attributed to the assignee at the moment the task was completed.</p>
      {members.map((member) => (
        <CompletedAssigneeSection
          key={member.user_id}
          name={memberLabel(member)}
          tasks={tasks.filter((task) => task.completed_assignee_id === member.user_id)}
          thisWeekStart={thisWeekStart}
          timezone={context.membership.timezone}
        />
      ))}
      {!!unassigned.length && <CompletedAssigneeSection name="Unassigned" tasks={unassigned} thisWeekStart={thisWeekStart} timezone={context.membership.timezone} />}
    </div>
  );
}

function AssigneeTaskSection({
  id,
  title,
  tasks,
  lists,
  members,
  references,
  context,
}: {
  id: string;
  title: string;
  tasks: Task[];
  lists: List[];
  members: Member[];
  references: TaskReference[];
  context: AgencyContext;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <div className="mb-3 flex items-end justify-between gap-4 border-b border-zinc-950 pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.06em]"><UsersRound className="size-4 text-blue-600" />{title}</h2>
        <span className="font-mono text-xs">{String(tasks.length).padStart(2, "0")} open</span>
      </div>
      {tasks.length ? (
        <TaskTable
          tasks={tasks}
          taskReferences={references}
          lists={lists}
          members={members}
          agencyId={context.agency.id}
          currentUserId={context.user.id}
          timezone={context.membership.timezone}
          showClient
        />
      ) : (
        <p className="border-y bg-white py-4 text-xs text-zinc-400">No open tasks.</p>
      )}
    </section>
  );
}

function CompletedAssigneeSection({ name, tasks, thisWeekStart, timezone }: { name: string; tasks: CompletedTask[]; thisWeekStart: Date; timezone: string }) {
  const thisWeek = tasks.filter((task) => new Date(task.completed_at) >= thisWeekStart);
  const lastWeek = tasks.filter((task) => new Date(task.completed_at) < thisWeekStart);
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4 border-b border-zinc-950 pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.06em]"><UsersRound className="size-4 text-blue-600" />{name}</h2>
        <span className="font-mono text-xs">{String(tasks.length).padStart(2, "0")} completed</span>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <CompletedPeriodList title="This week" tasks={thisWeek} timezone={timezone} />
        <CompletedPeriodList title="Last week" tasks={lastWeek} timezone={timezone} />
      </div>
    </section>
  );
}

function CompletedPeriodList({ title, tasks, timezone }: { title: string; tasks: CompletedTask[]; timezone: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
        <span>{title}</span><span className="font-mono">{tasks.length}</span>
      </div>
      <div className="border-y bg-white">
        {tasks.length ? tasks.map((task) => (
          <Link
            key={task.id}
            href={`/clients/${task.client_id}?tab=tasks&list=${task.task_list_id}&task=${task.id}`}
            className="flex items-start justify-between gap-4 border-b px-3 py-3 last:border-0 hover:bg-zinc-50"
          >
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{task.title}</span><span className="mt-1 block text-[10px] uppercase tracking-[0.05em] text-zinc-400">{task.clients?.name ?? "Client"}</span></span>
            <time dateTime={task.completed_at} className="shrink-0 text-[9px] uppercase tracking-[0.05em] text-emerald-700">{formatDateTime(task.completed_at, timezone)}</time>
          </Link>
        )) : <p className="px-3 py-4 text-xs text-zinc-400">No completed tasks.</p>}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone = "default" }: { icon: typeof ListTodo; label: string; value: number; tone?: "default" | "danger" | "success" }) {
  const toneClass = tone === "danger" ? "text-red-700" : tone === "success" ? "text-emerald-700" : "text-zinc-950";
  return (
    <div className="bg-white p-4">
      <p className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-400"><Icon className="size-3.5" />{label}</p>
      <p className={`mt-5 font-mono text-3xl ${toneClass}`}>{value}</p>
    </div>
  );
}

function MetricBar({ value, max }: { value: number; max: number }) {
  return <div className="h-1.5 bg-zinc-100"><div className="h-full bg-blue-600" style={{ width: `${Math.max(value ? 5 : 0, (value / max) * 100)}%` }} /></div>;
}

function SectionHeading({ icon: Icon, title, description }: { icon: typeof Building2; title: string; description: string }) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.06em]"><Icon className="size-4 text-blue-600" />{title}</h2>
      <p className="mt-1 text-xs text-zinc-400">{description}</p>
    </div>
  );
}

function TeamTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} className={`border-b py-3 text-[10px] font-semibold uppercase tracking-[0.1em] ${active ? "border-blue-600 text-zinc-950" : "border-transparent text-zinc-400 hover:text-zinc-950"}`}>{children}</Link>;
}

function memberLabel(member: Member) {
  return member.display_name || member.email || "Member";
}

function periodLabel(period: string) {
  if (period === "last_week") return "Last week";
  if (period === "this_week") return "This week";
  if (period === "last_30_days") return "Last 30 days";
  return period;
}

function reportEvidenceIds(report: AiTeamReport, key: "task_ids" | "client_ids") {
  return [...new Set([...report.wins, ...report.risks, ...report.recommendations].flatMap((item) => item[key]))];
}

function reportInclusiveEnd(periodEnd: string) {
  return new Date(new Date(periodEnd).getTime() - 1).toISOString();
}

function startOfUtcWeek(date: Date) {
  const start = new Date(date);
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
  start.setUTCHours(0, 0, 0, 0);
  return start;
}
