"use client";

import { useTransition } from "react";
import { archiveTask, deleteTask } from "@/actions/crm";

export function TaskLifecycleActions({ clientId, taskId }: { clientId: string; taskId: string }) {
  const [pending, startTransition] = useTransition();

  function submit(action: typeof archiveTask | typeof deleteTask) {
    const formData = new FormData();
    formData.set("client_id", clientId);
    formData.set("task_id", taskId);
    startTransition(() => action(formData));
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => submit(archiveTask)}
        className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
      >
        Archive task
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Delete this task permanently?")) submit(deleteTask);
        }}
        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 disabled:opacity-50"
      >
        Delete task
      </button>
    </div>
  );
}
