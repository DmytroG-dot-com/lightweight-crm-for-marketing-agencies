"use client";

import { RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { restoreTask } from "@/actions/crm";

export function TaskRestoreAction({ clientId, taskId }: { clientId: string; taskId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending || message === "Restored"}
        onClick={() => {
          const formData = new FormData();
          formData.set("client_id", clientId);
          formData.set("task_id", taskId);
          startTransition(async () => {
            try {
              await restoreTask(formData);
              setMessage("Restored");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Could not restore task.");
            }
          });
        }}
        className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-blue-700 disabled:opacity-50"
      >
        <RotateCcw className="size-3" />{pending ? "Restoring..." : "Restore task"}
      </button>
      {message && message !== "Restored" && <span className="text-[10px] text-red-600">{message}</span>}
    </div>
  );
}
