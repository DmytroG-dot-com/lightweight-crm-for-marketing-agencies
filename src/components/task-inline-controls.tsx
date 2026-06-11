"use client";

import { useTransition } from "react";
import { updateTaskDueDate, updateTaskStatus } from "@/actions/crm";
import { TASK_STATUSES } from "@/lib/constants";
import { formatLabel } from "@/lib/utils";

export function TaskStatusSelect({
  clientId,
  taskId,
  status,
}: {
  clientId: string;
  taskId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={status}
      disabled={pending}
      onChange={(event) => {
        const formData = new FormData();
        formData.set("client_id", clientId);
        formData.set("task_id", taskId);
        formData.set("status", event.currentTarget.value);
        startTransition(() => updateTaskStatus(formData));
      }}
      className="rounded-lg border px-2 py-1 text-xs disabled:opacity-50"
    >
      {TASK_STATUSES.map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}
    </select>
  );
}

export function TaskDueDateInput({
  clientId,
  taskId,
  dueDate,
}: {
  clientId: string;
  taskId: string;
  dueDate: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="date"
      defaultValue={dueDate ?? ""}
      disabled={pending}
      onChange={(event) => {
        const formData = new FormData();
        formData.set("client_id", clientId);
        formData.set("task_id", taskId);
        formData.set("due_date", event.currentTarget.value);
        startTransition(() => updateTaskDueDate(formData));
      }}
      className="rounded-lg border px-2 py-1 text-xs disabled:opacity-50"
    />
  );
}
