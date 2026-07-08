"use client";

import { ChevronDown, Layers3 } from "lucide-react";
import { useState } from "react";
import { TaskListTemplateSaver } from "@/components/task-list-template-saver";
import { TaskTemplateApplier } from "@/components/task-template-applier";

type TaskTemplateOption = {
  id: string;
  name: string;
  description: string | null;
};

export function TaskTemplateControls({
  clientId,
  taskListId,
  taskListName,
  canSaveCurrentList,
  templates,
}: {
  clientId: string;
  taskListId: string;
  taskListName: string;
  canSaveCurrentList: boolean;
  templates: TaskTemplateOption[];
}) {
  const [open, setOpen] = useState(false);

  if (!canSaveCurrentList && !templates.length) {
    return null;
  }

  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-300 hover:text-zinc-700"
        aria-expanded={open}
      >
        <Layers3 className="size-3" />
        Templates
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="basis-full w-full border-t border-zinc-200 bg-zinc-50/70 px-4 py-4">
          {templates.length > 0 ? (
            <TaskTemplateApplier
              clientId={clientId}
              taskListId={taskListId}
              templates={templates}
              embedded
            />
          ) : (
            <p className="text-xs text-zinc-500">
              Save a real task tree or custom list as a template first, then apply it here.
            </p>
          )}

          {canSaveCurrentList && (
            <div className={`${templates.length > 0 ? "mt-4 border-t border-zinc-200 pt-4" : "mt-4"}`}>
              <TaskListTemplateSaver
                clientId={clientId}
                taskListId={taskListId}
                defaultName={taskListName}
                embedded
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
