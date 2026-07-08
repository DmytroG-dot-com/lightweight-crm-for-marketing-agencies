"use client";

import { Layers3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applyTaskTemplate } from "@/actions/task-templates";

type TaskTemplateOption = {
  id: string;
  name: string;
  description: string | null;
};

export function TaskTemplateApplier({
  clientId,
  taskListId,
  templates,
  embedded = false,
}: {
  clientId: string;
  taskListId: string;
  templates: TaskTemplateOption[];
  embedded?: boolean;
}) {
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!templates.length) {
    return (
      <div className={embedded ? "text-xs text-zinc-500" : "border-y border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-xs text-zinc-500"}>
        Save a real task tree as a template first, then apply it here for new clients.
      </div>
    );
  }

  const activeTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];

  function submit() {
    if (!selectedTemplateId) return;

    startTransition(async () => {
      setMessage(null);
      setError(null);

      try {
        const formData = new FormData();
        formData.set("client_id", clientId);
        formData.set("task_list_id", taskListId);
        formData.set("template_id", selectedTemplateId);
        const result = await applyTaskTemplate(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(result.message);
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not apply task template.");
      }
    });
  }

  return (
    <div className={embedded ? "" : "border-y border-zinc-200 bg-zinc-50/70 px-4 py-4"}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {!embedded && <p className="ui-kicker">Task templates</p>}
          <p className={`${embedded ? "" : "mt-1 "}flex items-center gap-2 text-sm text-zinc-700`}>
            <Layers3 className="size-4 text-blue-600" />
            {embedded ? "Apply saved template" : "Apply a saved task template to this client."}
          </p>
          {activeTemplate?.description && (
            <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-500">{activeTemplate.description}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="text-sm font-medium">
            <span className="block normal-case text-xs font-medium tracking-normal text-zinc-500">
              Template
            </span>
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.currentTarget.value)}
              className="mt-1.5 min-w-[240px] rounded-lg border bg-white px-3 py-2 text-sm"
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending || !selectedTemplateId}
            onClick={submit}
            className="ui-action ui-action-primary disabled:opacity-50"
          >
            {pending ? "Applying..." : "Apply template"}
          </button>
        </div>
      </div>
      {message && <p className="mt-3 text-xs text-emerald-700">{message}</p>}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
