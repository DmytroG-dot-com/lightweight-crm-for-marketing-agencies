import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { type List, type Member, type Task, TaskTable } from "@/components/task-table";
import { requireAgency } from "@/lib/auth";
import { signTaskAttachments } from "@/lib/comment-attachments";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { addDays, dateInputValue, formatLabel } from "@/lib/utils";

type Search = { status?: string; priority?: string; due?: string };

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<Search> }) {
  const filters = await searchParams;
  const context = await requireAgency();
  let query = context.supabase
    .from("tasks")
    .select("*, clients(name), task_comments(id, body, created_at, author_id, task_comment_attachments(id, storage_path, file_name, content_type, size_bytes))")
    .eq("agency_id", context.agency.id)
    .eq("assignee_id", context.user.id)
    .is("archived_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.due === "overdue") query = query.lt("due_date", dateInputValue()).neq("status", "complete");
  if (filters.due === "today") query = query.eq("due_date", dateInputValue());
  if (filters.due === "week") query = query.lte("due_date", dateInputValue(addDays(new Date(), 7)));

  const [{ data: rawTasks }, { data: lists }, { data: members }] = await Promise.all([
    query,
    context.supabase.from("task_lists").select("id, name, kind, client_id").eq("agency_id", context.agency.id).is("archived_at", null),
    context.supabase.from("agency_members").select("user_id, display_name, email").eq("agency_id", context.agency.id),
  ]);
  const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const tasks = ((rawTasks ?? []) as Task[]).sort((a, b) => {
    const dueCompare = (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");
    return dueCompare || priorityRank[a.priority] - priorityRank[b.priority];
  });
  await signTaskAttachments(tasks);

  return (
    <>
      <PageHeader title="My Work" description="Tasks assigned to you, ordered by due date and priority." />
      <form className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <Filter name="status" label="Status" value={filters.status} options={TASK_STATUSES} />
        <Filter name="priority" label="Priority" value={filters.priority} options={TASK_PRIORITIES} />
        <label className="text-xs font-medium text-zinc-500">
          Due
          <select name="due" defaultValue={filters.due ?? ""} className="mt-1 block rounded-lg border px-3 py-2 text-sm text-zinc-900">
            <option value="">Any</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="week">Next 7 days</option>
          </select>
        </label>
        <button className="rounded-lg border px-3 py-2 text-sm font-medium">Filter</button>
        <Link href="/my-work" className="px-2 py-2 text-sm text-zinc-500">Clear</Link>
      </form>
      <TaskTable tasks={tasks} lists={(lists ?? []) as List[]} members={(members ?? []) as Member[]} agencyId={context.agency.id} showClient />
    </>
  );
}

function Filter({ name, label, value, options }: { name: string; label: string; value?: string; options: readonly string[] }) {
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
