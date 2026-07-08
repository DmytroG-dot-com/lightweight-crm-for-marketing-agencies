import Link from "next/link";
import { AlertTriangle, CalendarCheck, CalendarClock, CalendarX2, CheckCircle2, ListFilter, X } from "lucide-react";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { type List, type Member, type Task, TaskTable } from "@/components/task-table";
import type { TaskReference } from "@/components/task-detail-modal";
import { requireAgency } from "@/lib/auth";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { TASK_REFERENCE_SELECT, TASK_SUMMARY_SELECT } from "@/lib/task-selects";
import { addDaysToDateValue, dateInputValue, formatLabel } from "@/lib/utils";

type Search = { status?: string; priority?: string; due?: string };

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<Search> }) {
  const filters = await searchParams;
  const hasFilters = Boolean(filters.status || filters.priority || filters.due);
  const context = await requireAgency();
  const today = dateInputValue(new Date(), context.membership.timezone);
  let query = context.supabase
    .from("tasks")
    .select(TASK_SUMMARY_SELECT)
    .eq("agency_id", context.agency.id)
    .eq("assignee_id", context.user.id)
    .is("archived_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  else query = query.neq("status", "complete");
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.due === "overdue") query = query.lt("due_date", today);
  if (filters.due === "today") query = query.eq("due_date", today);
  if (filters.due === "week") query = query.lte("due_date", addDaysToDateValue(today, 7));

  const [{ data: rawTasks, error: tasksError }, { data: lists, error: listsError }, { data: members, error: membersError }] = await Promise.all([
    query,
    context.supabase.from("task_lists").select("id, name, kind, client_id").eq("agency_id", context.agency.id).is("archived_at", null),
    context.supabase.from("agency_members").select("user_id, display_name, email").eq("agency_id", context.agency.id),
  ]);
  const queryError = tasksError || listsError || membersError;
  if (queryError) throw new Error(queryError.message);
  const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const tasks = ((rawTasks ?? []) as unknown as Task[]).sort((a, b) => {
    const aDue = a.due_date ?? "9999-12-31";
    const bDue = b.due_date ?? "9999-12-31";
    const dueCompare = aDue === bDue ? 0 : aDue < bDue ? -1 : 1;
    return dueCompare || priorityRank[a.priority] - priorityRank[b.priority];
  });
  const clientIds = [...new Set(tasks.map((task) => task.client_id))];
  const { data: taskReferences, error: taskReferencesError } = clientIds.length
    ? await context.supabase
      .from("tasks")
      .select(TASK_REFERENCE_SELECT)
      .eq("agency_id", context.agency.id)
      .in("client_id", clientIds)
    : { data: [], error: null };
  if (taskReferencesError) throw new Error(taskReferencesError.message);
  const references = (taskReferences ?? []) as unknown as TaskReference[];
  const overdue = tasks.filter((task) => !!task.due_date && task.due_date < today);
  const next = tasks.filter((task) => !!task.start_date && task.start_date > today && (!task.due_date || task.due_date >= today));
  const noDate = tasks.filter((task) => !task.start_date && !task.due_date);
  const todayTasks = tasks.filter((task) =>
    !overdue.includes(task)
    && !next.includes(task)
    && !noDate.includes(task)
    && (!task.start_date || task.start_date <= today)
    && (!task.due_date || task.due_date >= today),
  );
  const sections = filters.status === "complete"
    ? [{ title: "Complete", description: null, tasks, tone: "default" as const, icon: CheckCircle2 }]
    : [
      { title: "Overdue", description: "Due date has passed and the task is not complete.", tasks: overdue, tone: "danger" as const, icon: AlertTriangle },
      { title: "Today", description: null, tasks: todayTasks, tone: "default" as const, icon: CalendarCheck },
      { title: "Next", description: "Task start date is still ahead.", tasks: next, tone: "default" as const, icon: CalendarClock },
      { title: "No Date", description: "Assigned tasks without a start or due date.", tasks: noDate, tone: "default" as const, icon: CalendarX2 },
    ];

  return (
    <>
      <PageHeader title="My Work" description="Tasks assigned to you, ordered by due date and priority." />
      <AutoFilterForm className="ui-filter-bar mb-8 border-b border-zinc-200 pb-3">
        <ListFilter className="ui-filter-icon" aria-hidden="true" />
        <Filter name="status" label="Status" value={filters.status} options={TASK_STATUSES} emptyLabel="All open" />
        <Filter name="priority" label="Priority" value={filters.priority} options={TASK_PRIORITIES} />
        <label className="ui-filter-field" data-active={Boolean(filters.due)}>
          <span>Due</span>
          <select name="due" defaultValue={filters.due ?? ""}>
            <option value="">Any</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="week">Next 7 days</option>
          </select>
        </label>
        {hasFilters && <Link href="/my-work" className="ui-filter-clear"><X className="size-3" />Clear</Link>}
      </AutoFilterForm>
      {!tasks.length && (
        <EmptyState
          title={filters.status === "complete" ? "No completed work" : "No assigned work"}
          description={filters.status === "complete" ? "Completed tasks assigned to you will appear here." : "Incomplete tasks assigned to you will appear here."}
        />
      )}
      <div className="space-y-12">
        {sections.map((section) => section.tasks.length > 0 && (
          <section key={section.title}>
            <div className={`mb-3 flex items-end justify-between gap-4 border-b pb-3 ${section.tone === "danger" ? "border-red-500 text-red-700" : "border-zinc-950"}`}>
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.06em]">
                  <section.icon className="size-4" />{section.title}
                </h2>
                {section.description && (
                  <p className={`mt-1 text-xs ${section.tone === "danger" ? "text-red-600" : "text-zinc-400"}`}>{section.description}</p>
                )}
              </div>
              <span className="font-mono text-xs">{String(section.tasks.length).padStart(2, "0")}</span>
            </div>
            <TaskTable tasks={section.tasks} taskReferences={references} lists={(lists ?? []) as List[]} members={(members ?? []) as Member[]} agencyId={context.agency.id} currentUserId={context.user.id} currentUserRole={context.membership.role} timezone={context.membership.timezone} showClient tone={section.tone} />
          </section>
        ))}
      </div>
    </>
  );
}

function Filter({
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
