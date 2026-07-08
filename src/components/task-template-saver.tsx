"use client";

import { Layers3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveTaskTreeAsTemplate } from "@/actions/task-templates";

export function TaskTemplateSaver({
  clientId,
  taskId,
  defaultName,
  embedded = false,
  onSaved,
}: {
  clientId: string;
  taskId: string;
  defaultName: string;
  embedded?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) {
      setError("Template name is required.");
      return;
    }

    startTransition(async () => {
      setMessage(null);
      setError(null);

      try {
        const formData = new FormData();
        formData.set("client_id", clientId);
        formData.set("task_id", taskId);
        formData.set("name", name.trim());
        formData.set("description", description.trim());
        const result = await saveTaskTreeAsTemplate(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(result.message);
        router.refresh();
        onSaved?.();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not save task template.");
      }
    });
  }

  return (
    <div className={embedded ? "" : "border-y border-zinc-200 bg-zinc-50/70 px-4 py-4"}>
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
        <Layers3 className="size-4 text-blue-600" />
        Save this task tree as a reusable template
      </div>
      <p className="mt-1 text-xs leading-5 text-zinc-500">
        This captures the current task and all subtasks, so you can spin up the same workflow for another client in one click.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-end">
        <label className="text-sm font-medium">
          Template name
          <input
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            placeholder="Client launch workflow"
          />
        </label>
        <label className="text-sm font-medium">
          Description
          <input
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            placeholder="Optional note for when to use this template"
          />
        </label>
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={submit}
          className="ui-action ui-action-primary disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save template"}
        </button>
      </div>
      {message && <p className="mt-3 text-xs text-emerald-700">{message}</p>}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
