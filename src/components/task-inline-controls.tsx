"use client";

import { useEffect, useState, useTransition } from "react";
import { updateTaskDates, updateTaskField } from "@/actions/crm";
import { TaskDateRangePicker } from "@/components/task-date-range-picker";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { taskPriorityTone, taskStatusTone } from "@/lib/task-tones";
import { formatLabel } from "@/lib/utils";

function useTaskFieldUpdate(clientId: string, taskId: string) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(field: string, value: string, onError?: () => void) {
    const formData = new FormData();
    formData.set("client_id", clientId);
    formData.set("task_id", taskId);
    formData.set("field", field);
    formData.set("value", value);
    setError(null);
    startTransition(async () => {
      try {
        await updateTaskField(formData);
      } catch (updateError) {
        onError?.();
        setError(updateError instanceof Error ? updateError.message : "Could not save change.");
      }
    });
  }

  return { error, pending, update };
}

export function TaskStatusSelect({
  clientId,
  taskId,
  status,
  onCompletionStart,
  onCompletionError,
}: {
  clientId: string;
  taskId: string;
  status: string;
  onCompletionStart?: () => void;
  onCompletionError?: () => void;
}) {
  const { error, pending, update } = useTaskFieldUpdate(clientId, taskId);
  const [value, setValue] = useState(status);

  useEffect(() => {
    setValue(status);
  }, [status]);

  return (
    <select
      value={value}
      disabled={pending}
      aria-invalid={Boolean(error)}
      title={error ?? undefined}
      onChange={(event) => {
        const previous = value;
        const next = event.currentTarget.value;
        const completing = previous !== "complete" && next === "complete";
        if (completing) onCompletionStart?.();
        setValue(next);
        update("status", next, () => {
          setValue(previous);
          if (completing) onCompletionError?.();
        });
      }}
      className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50 ${taskStatusTone[value] ?? taskStatusTone.todo}`}
    >
      {TASK_STATUSES.map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}
    </select>
  );
}

export function TaskDueDateInput({
  clientId,
  taskId,
  isRecurring,
  startDate,
  dueDate,
}: {
  clientId: string;
  taskId: string;
  isRecurring: boolean;
  startDate: string | null;
  dueDate: string | null;
}) {
  return <TaskDateInput clientId={clientId} taskId={taskId} isRecurring={isRecurring} startDate={startDate} dueDate={dueDate} />;
}

function TaskDateInput({
  clientId,
  taskId,
  isRecurring,
  startDate,
  dueDate,
}: {
  clientId: string;
  taskId: string;
  isRecurring: boolean;
  startDate: string | null;
  dueDate: string | null;
}) {
  const [dates, setDates] = useState({ start: startDate ?? "", due: dueDate ?? "" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDates({ start: startDate ?? "", due: dueDate ?? "" });
  }, [startDate, dueDate]);

  return (
    <div title={error ?? undefined}>
      <TaskDateRangePicker
        startDate={dates.start}
        dueDate={dates.due}
        disabled={pending}
        compactField="due"
        recurrenceTask={{ clientId, taskId, isRecurring }}
        onRecurrenceSaved={({ startDate: nextStart, dueDate: nextDue }) => setDates({ start: nextStart, due: nextDue })}
        onChange={(nextStart, nextDue) => {
          const previous = dates;
          setDates({ start: nextStart, due: nextDue });
          setError(null);
          const formData = new FormData();
          formData.set("client_id", clientId);
          formData.set("task_id", taskId);
          formData.set("start_date", nextStart);
          formData.set("due_date", nextDue);
          startTransition(async () => {
            try {
              await updateTaskDates(formData);
            } catch (updateError) {
              setDates(previous);
              setError(updateError instanceof Error ? updateError.message : "Could not save dates.");
            }
          });
        }}
      />
    </div>
  );
}

export function TaskPrioritySelect({
  clientId,
  taskId,
  priority,
}: {
  clientId: string;
  taskId: string;
  priority: string;
}) {
  const { error, pending, update } = useTaskFieldUpdate(clientId, taskId);
  const [value, setValue] = useState(priority);

  return (
    <select
      value={value}
      disabled={pending}
      aria-invalid={Boolean(error)}
      title={error ?? undefined}
      onChange={(event) => {
        const previous = value;
        const next = event.currentTarget.value;
        setValue(next);
        update("priority", next, () => setValue(previous));
      }}
      className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50 ${taskPriorityTone[value] ?? taskPriorityTone.normal}`}
    >
      {TASK_PRIORITIES.map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}
    </select>
  );
}

export function TaskAssigneeSelect({
  clientId,
  taskId,
  assigneeId,
  members,
}: {
  clientId: string;
  taskId: string;
  assigneeId: string | null;
  members: Array<{ user_id: string; display_name: string | null; email: string | null }>;
}) {
  const { error, pending, update } = useTaskFieldUpdate(clientId, taskId);
  const [value, setValue] = useState(assigneeId ?? "");

  return (
    <select
      value={value}
      disabled={pending}
      aria-invalid={Boolean(error)}
      title={error ?? undefined}
      onChange={(event) => {
        const previous = value;
        const next = event.currentTarget.value;
        setValue(next);
        update("assignee_id", next, () => setValue(previous));
      }}
      className="max-w-36 border-0 border-b border-zinc-300 bg-transparent px-0 py-1 text-[10px] uppercase tracking-wide disabled:opacity-50"
    >
      <option value="">Unassigned</option>
      {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.email || "Member"}</option>)}
    </select>
  );
}
