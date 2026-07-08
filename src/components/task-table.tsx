"use client";

import { Archive, ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { bulkUpdateTasks } from "@/actions/crm";
import { EmptyState } from "@/components/empty-state";
import {
  type LinkedCreativeRequest,
  type TaskReference,
  type TaskSummary,
  TaskDetailModal,
} from "@/components/task-detail-modal";
import { TaskAssigneeSelect, TaskDueDateInput, TaskPrioritySelect, TaskStatusSelect } from "@/components/task-inline-controls";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { formatLabel } from "@/lib/utils";

export type Member = { user_id: string; display_name: string | null; email: string | null };
export type List = { id: string; name: string; kind?: string; client_id?: string };
export type Task = TaskSummary;
type SortKey = "title" | "client" | "status" | "priority" | "assignee" | "due_date";

function compareText(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("button, a, input, select, textarea, label, summary, [role='button']"));
}

export function TaskTable({
  tasks,
  lists,
  members,
  taskReferences,
  agencyId,
  currentUserId,
  currentUserRole,
  timezone,
  focusedTaskId,
  showClient = false,
  tone = "default",
  creativeRequests = [],
}: {
  tasks: Task[];
  lists: List[];
  members: Member[];
  taskReferences: TaskReference[];
  agencyId: string;
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
  timezone: string;
  focusedTaskId?: string;
  showClient?: boolean;
  tone?: "default" | "danger";
  creativeRequests?: LinkedCreativeRequest[];
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "due_date", direction: "asc" });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [completingIds, setCompletingIds] = useState<Set<string>>(() => new Set());
  const completionTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const taskTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const memberNames = useMemo(() => new Map(members.map((member) => [member.user_id, member.display_name || member.email || "Member"])), [members]);
  const sortedTasks = useMemo(() => {
    const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    const statusRank: Record<string, number> = { todo: 0, in_progress: 1, review: 2, blocked: 3, complete: 4 };
    const valueFor = (task: Task, key: SortKey): string | number | null => {
      if (key === "title") return task.title.toLowerCase();
      if (key === "client") return task.clients?.name.toLowerCase() ?? null;
      if (key === "status") return statusRank[task.status] ?? 99;
      if (key === "priority") return priorityRank[task.priority] ?? 99;
      if (key === "assignee") return task.assignee_id ? memberNames.get(task.assignee_id)?.toLowerCase() ?? null : null;
      return task.due_date;
    };

    return [...tasks].sort((a, b) => {
      const aValue = valueFor(a, sort.key);
      const bValue = valueFor(b, sort.key);
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      const result = typeof aValue === "number" && typeof bValue === "number"
        ? aValue - bValue
        : compareText(String(aValue), String(bValue));
      return sort.direction === "asc" ? result : -result;
    });
  }, [memberNames, sort, tasks]);
  const visibleTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const visibleSelectedIds = useMemo(
    () => new Set([...selectedIds].filter((taskId) => visibleTaskIds.has(taskId))),
    [selectedIds, visibleTaskIds],
  );
  const allVisibleSelected = sortedTasks.length > 0 && sortedTasks.every((task) => visibleSelectedIds.has(task.id));
  const someVisibleSelected = sortedTasks.some((task) => visibleSelectedIds.has(task.id));

  function changeSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  function animateCompletion(taskIds: string[]) {
    setCompletingIds((current) => new Set([...current, ...taskIds]));
    taskIds.forEach((taskId) => {
      const currentTimer = completionTimers.current.get(taskId);
      if (currentTimer) clearTimeout(currentTimer);
      completionTimers.current.set(taskId, setTimeout(() => {
        completionTimers.current.delete(taskId);
        setCompletingIds((current) => {
          const next = new Set(current);
          next.delete(taskId);
          return next;
        });
      }, 700));
    });
  }

  function cancelCompletion(taskIds: string[]) {
    taskIds.forEach((taskId) => {
      const timer = completionTimers.current.get(taskId);
      if (timer) clearTimeout(timer);
      completionTimers.current.delete(taskId);
    });
    setCompletingIds((current) => {
      const next = new Set(current);
      taskIds.forEach((taskId) => next.delete(taskId));
      return next;
    });
  }

  useEffect(() => {
    const timers = completionTimers.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  if (!tasks.length) return <EmptyState title="No tasks found" description="Create a task or adjust the current filters." />;
  return (
    <div className={`overflow-hidden border-y border-zinc-950 ${tone === "danger" ? "bg-red-50/70" : "bg-white"}`}>
      {!!visibleSelectedIds.size && (
        <BulkTaskToolbar
          selectedTaskIds={[...visibleSelectedIds]}
          members={members}
          onComplete={() => setSelectedIds(new Set())}
          onClear={() => setSelectedIds(new Set())}
          onCompletionStart={animateCompletion}
          onCompletionError={cancelCompletion}
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className={`border-b border-zinc-950 text-[9px] uppercase tracking-[0.12em] text-zinc-400 ${tone === "danger" ? "bg-red-50" : "bg-white"}`}>
            <tr>
              <th className="w-10 px-3 py-3">
                <SelectionCheckbox
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected && !allVisibleSelected}
                  label={allVisibleSelected ? "Deselect all visible tasks" : "Select all visible tasks"}
                  onChange={() => {
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      if (allVisibleSelected) sortedTasks.forEach((task) => next.delete(task.id));
                      else sortedTasks.forEach((task) => next.add(task.id));
                      return next;
                    });
                  }}
                />
              </th>
              <SortableHeader label="Task" sortKey="title" activeSort={sort} onSort={changeSort} />
              {showClient && <SortableHeader label="Client" sortKey="client" activeSort={sort} onSort={changeSort} />}
              <SortableHeader label="Status" sortKey="status" activeSort={sort} onSort={changeSort} />
              <SortableHeader label="Priority" sortKey="priority" activeSort={sort} onSort={changeSort} />
              <SortableHeader label="Assignee" sortKey="assignee" activeSort={sort} onSort={changeSort} />
              <SortableHeader label="Due" sortKey="due_date" activeSort={sort} onSort={changeSort} />
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedTasks.map((task) => (
              <tr key={task.id} className={`align-top transition ${completingIds.has(task.id) ? "task-row-completing" : visibleSelectedIds.has(task.id) ? "bg-blue-50/70" : tone === "danger" ? "hover:bg-red-100/60" : "hover:bg-zinc-50/70"}`}>
                <td className="px-3 py-4">
                  <SelectionCheckbox
                    checked={visibleSelectedIds.has(task.id)}
                    label={`Select ${task.title}`}
                    onChange={() => {
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (next.has(task.id)) next.delete(task.id);
                        else next.add(task.id);
                        return next;
                      });
                    }}
                  />
                </td>
                <td
                  className="cursor-pointer px-4 py-4"
                  onClick={(event) => {
                    if (isInteractiveTarget(event.target)) return;
                    taskTriggerRefs.current.get(task.id)?.click();
                  }}
                >
                  <TaskDetailModal
                    task={task}
                    lists={lists.filter((list) => !list.client_id || list.client_id === task.client_id)}
                    members={members}
                    taskReferences={taskReferences.filter((candidate) => candidate.client_id === task.client_id)}
                    creativeRequests={creativeRequests.filter((candidate) => candidate.client_id === task.client_id)}
                    agencyId={agencyId}
                    currentUserId={currentUserId}
                    currentUserRole={currentUserRole}
                    timezone={timezone}
                    initiallyOpen={task.id === focusedTaskId}
                    triggerRef={(node) => {
                      if (node) taskTriggerRefs.current.set(task.id, node);
                      else taskTriggerRefs.current.delete(task.id);
                    }}
                  />
                  {task.parent_task_id && <ParentTaskLink task={task} taskReferences={taskReferences} />}
                </td>
                {showClient && <td className="px-4 py-3 text-zinc-600">{task.clients?.name ?? "—"}</td>}
                <td className="px-4 py-3">
                  <TaskStatusSelect
                    key={task.status}
                    clientId={task.client_id}
                    taskId={task.id}
                    status={task.status}
                    onCompletionStart={() => animateCompletion([task.id])}
                    onCompletionError={() => cancelCompletion([task.id])}
                  />
                </td>
                <td className="px-4 py-3"><TaskPrioritySelect key={task.priority} clientId={task.client_id} taskId={task.id} priority={task.priority} /></td>
                <td className="px-4 py-3 text-zinc-600"><TaskAssigneeSelect key={task.assignee_id ?? "unassigned"} clientId={task.client_id} taskId={task.id} assigneeId={task.assignee_id} members={members} /></td>
                <td className="px-4 py-3 text-zinc-600"><TaskDueDateInput key={`${task.start_date ?? "no-start"}:${task.due_date ?? "no-due"}:${task.source_recurring_rule_id ?? "not-recurring"}`} clientId={task.client_id} taskId={task.id} isRecurring={Boolean(task.source_recurring_rule_id)} startDate={task.start_date} dueDate={task.due_date} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ParentTaskLink({ task, taskReferences }: { task: Task; taskReferences: TaskReference[] }) {
  const reference = taskReferences.find((candidate) => candidate.id === task.parent_task_id);
  const parent = reference ?? task.parent_task;
  const label = <> <GitBranchIcon />Subtask of {parent?.title ?? "parent task"}{reference?.archived_at ? " · archived" : ""}</>;
  const className = "mt-1 flex max-w-72 items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.06em]";

  if (!parent || reference?.archived_at) {
    return <p className={`${className} text-zinc-400`}>{label}</p>;
  }

  return (
    <Link
      href={`/clients/${task.client_id}?tab=tasks&list=${parent.task_list_id ?? task.task_list_id ?? "general"}&task=${parent.id}`}
      className={`${className} text-blue-600 hover:text-blue-800 hover:underline`}
    >
      {label}
    </Link>
  );
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="size-3.5 cursor-pointer accent-blue-600"
    />
  );
}

function BulkTaskToolbar({
  selectedTaskIds,
  members,
  onComplete,
  onClear,
  onCompletionStart,
  onCompletionError,
}: {
  selectedTaskIds: string[];
  members: Member[];
  onComplete: () => void;
  onClear: () => void;
  onCompletionStart: (taskIds: string[]) => void;
  onCompletionError: (taskIds: string[]) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState("");

  function apply(action: "status" | "priority" | "assignee" | "archive", value?: string | null) {
    const completing = action === "status" && value === "complete";
    setError("");
    if (completing) onCompletionStart(selectedTaskIds);
    startTransition(async () => {
      try {
        await bulkUpdateTasks({ taskIds: selectedTaskIds, action, value });
        setConfirmArchive(false);
        onComplete();
      } catch (actionError) {
        if (completing) onCompletionError(selectedTaskIds);
        setError(actionError instanceof Error ? actionError.message : "Could not update selected tasks.");
      }
    });
  }

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-zinc-950 bg-blue-50 px-3 py-2">
      <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-800">
        {selectedTaskIds.length} selected
      </span>
      {confirmArchive ? (
        <>
          <span className="text-[10px] font-medium text-red-700">Archive selected tasks and their subtasks?</span>
          <button type="button" disabled={pending} onClick={() => apply("archive")} className="ui-action border-red-600 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
            {pending ? "Archiving..." : "Confirm archive"}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirmArchive(false)} className="ui-action disabled:opacity-50">Cancel</button>
        </>
      ) : (
        <>
          <BulkSelect
            label="Set status"
            disabled={pending}
            options={TASK_STATUSES.map((value) => ({ value, label: formatLabel(value) }))}
            onChange={(value) => apply("status", value)}
          />
          <BulkSelect
            label="Set priority"
            disabled={pending}
            options={TASK_PRIORITIES.map((value) => ({ value, label: formatLabel(value) }))}
            onChange={(value) => apply("priority", value)}
          />
          <BulkSelect
            label="Set assignee"
            disabled={pending}
            options={[
              { value: "__unassigned__", label: "Unassigned" },
              ...members.map((member) => ({ value: member.user_id, label: member.display_name || member.email || "Member" })),
            ]}
            onChange={(value) => apply("assignee", value === "__unassigned__" ? null : value)}
          />
          <button type="button" disabled={pending} onClick={() => setConfirmArchive(true)} className="ui-action flex items-center gap-1.5 text-red-600 disabled:opacity-50">
            <Archive className="size-3.5" />Archive
          </button>
          <button type="button" disabled={pending} onClick={onClear} className="ml-auto flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-500 hover:text-zinc-950 disabled:opacity-50">
            <X className="size-3.5" />Clear
          </button>
        </>
      )}
      {pending && !confirmArchive && <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-blue-700">Updating...</span>}
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
    </div>
  );
}

function BulkSelect({
  label,
  options,
  disabled,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value=""
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
      className="border border-blue-200 bg-white px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-700 disabled:opacity-50"
      aria-label={label}
    >
      <option value="" disabled>{label}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function GitBranchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3 shrink-0 fill-none stroke-current" strokeWidth="1.5">
      <path d="M4 2v7a3 3 0 0 0 3 3h5M4 5h5M9 5l-2-2m2 2L7 7" />
    </svg>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeSort: { key: SortKey; direction: "asc" | "desc" };
  onSort: (key: SortKey) => void;
}) {
  const active = activeSort.key === sortKey;
  return (
    <th className="px-4 py-3 font-medium">
      <button type="button" onClick={() => onSort(sortKey)} className={`flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${active ? "text-blue-700" : "text-zinc-400 hover:text-zinc-950"}`}>
        {label}
        {active ? activeSort.direction === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 text-zinc-300" />}
      </button>
    </th>
  );
}
