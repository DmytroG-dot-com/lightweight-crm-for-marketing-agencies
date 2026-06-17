"use client";

import { AlertCircle, ArrowUp, Bot, Check, Clock3, LoaderCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPlainTaskFromInstruction, createTaskFromInstruction } from "@/actions/ai";

type QueueItem = {
  id: string;
  instruction: string;
  clientId: string;
  listId: string;
  useAi: boolean;
  status: "queued" | "processing" | "created" | "error";
  detail?: string;
};

export function QuickTaskComposer({
  currentClientId,
  currentListId,
  aiConfigured,
  autoFocus = false,
}: {
  currentClientId: string;
  currentListId: string;
  aiConfigured: boolean;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [instruction, setInstruction] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [useAi, setUseAi] = useState(aiConfigured);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus, currentClientId, currentListId]);

  useEffect(() => {
    if (processingId) return;
    const next = queue.find((item) => item.status === "queued");
    if (!next) return;

    setProcessingId(next.id);
    setQueue((current) => current.map((item) => item.id === next.id ? { ...item, status: "processing" } : item));

    void (async () => {
      try {
        const createAction = next.useAi ? createTaskFromInstruction : createPlainTaskFromInstruction;
        const result = await createAction({
          instruction: next.instruction,
          current_client_id: next.clientId,
          current_list_id: next.listId,
        });
        setQueue((current) => current.map((item) => item.id === next.id
          ? {
            ...item,
            status: "created",
            detail: result.warning || `Created "${result.taskTitle}" for ${result.clientName}`,
          }
          : item));
        router.refresh();
        window.setTimeout(() => {
          setQueue((current) => current.filter((item) => item.id !== next.id || item.status !== "created"));
        }, 6000);
      } catch (createError) {
        setQueue((current) => current.map((item) => item.id === next.id
          ? {
            ...item,
            status: "error",
            detail: createError instanceof Error ? createError.message : "Unable to create task.",
          }
          : item));
      } finally {
        setProcessingId(null);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    })();
  }, [processingId, queue, router]);

  function enqueue() {
    const cleanInstruction = instruction.trim();
    if (!cleanInstruction) return;
    setQueue((current) => [...current, {
      id: crypto.randomUUID(),
      instruction: cleanInstruction,
      clientId: currentClientId,
      listId: currentListId,
      useAi,
      status: "queued",
    }]);
    setInstruction("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function retry(id: string) {
    setQueue((current) => current.map((item) => item.id === id ? { ...item, status: "queued", detail: undefined } : item));
  }

  function dismiss(id: string) {
    setQueue((current) => current.filter((item) => item.id !== id));
  }

  const activeCount = queue.filter((item) => item.status === "queued" || item.status === "processing").length;

  return (
    <div className="border-y border-blue-600 bg-blue-50/40 py-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4">
        <span className="col-start-1 row-start-2 grid size-8 shrink-0 place-items-center bg-violet-600 text-white sm:row-start-1">
          <Sparkles className="size-4" strokeWidth={1.75} />
        </span>
        <textarea
          ref={inputRef}
          rows={2}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              enqueue();
            }
          }}
          placeholder="Add a task: assign landing page audit to Anna, high priority, due Friday..."
          className="col-span-2 row-start-1 min-h-24 w-full resize-none border-0 bg-transparent px-0 py-1.5 text-base outline-none placeholder:text-zinc-300 disabled:opacity-60 sm:col-span-1 sm:col-start-2 sm:min-h-12"
        />
        <button
          type="button"
          disabled={!instruction.trim()}
          onClick={enqueue}
          className="ui-action ui-action-primary col-start-2 row-start-2 flex w-full items-center justify-center gap-1.5 disabled:opacity-40 sm:col-start-3 sm:row-start-1 sm:w-auto sm:self-end"
        >
          <ArrowUp className="size-3.5" />
          {activeCount ? "Add to queue" : useAi ? "Analyze & create" : "Quick create"}
        </button>
      </div>
      <div className="mt-3 flex flex-col items-start gap-2 text-[9px] font-semibold uppercase tracking-[0.1em] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className={activeCount ? "text-blue-700" : "text-zinc-400"}>
          {activeCount ? `${activeCount} task${activeCount === 1 ? "" : "s"} processing one by one` : "Ready for tasks"}
        </span>
        {aiConfigured ? (
          <button
            type="button"
            onClick={() => setUseAi((enabled) => !enabled)}
            className={`flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${useAi ? "text-violet-600 hover:text-violet-800" : "text-zinc-400 hover:text-zinc-700"}`}
            aria-pressed={useAi}
            title={useAi ? "Disable AI parsing and create entered text directly" : "Enable AI task parsing"}
          >
            <Bot className="size-3.5" />AI parsing {useAi ? "enabled" : "disabled"}
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Bot className="size-3.5" />Add an OpenAI key in Settings for AI parsing
          </span>
        )}
      </div>
      {!!queue.length && (
        <div className="mt-3 divide-y divide-blue-100 border-t border-blue-200/70">
          {queue.map((item) => (
            <div key={item.id} className="flex items-start gap-2 py-2 text-[10px]">
              <QueueIcon status={item.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-zinc-600">{item.instruction}</p>
                <p className="mt-0.5 text-[8px] uppercase tracking-[0.08em] text-zinc-400">{item.useAi ? "AI parsing" : "Quick create"}</p>
                {item.detail && (
                  <p className={`mt-0.5 truncate ${item.status === "error" ? "text-red-600" : item.detail.startsWith("AI parsing failed") ? "text-amber-700" : "text-emerald-700"}`}>
                    {item.detail}
                  </p>
                )}
              </div>
              {item.status === "error" && (
                <button type="button" onClick={() => retry(item.id)} className="p-1 text-zinc-400 hover:text-blue-700" aria-label="Retry queued task" title="Retry">
                  <RotateCcw className="size-3" />
                </button>
              )}
              {(item.status === "error" || item.status === "created") && (
                <button type="button" onClick={() => dismiss(item.id)} className="p-1 text-zinc-300 hover:text-zinc-700" aria-label="Dismiss queued task" title="Dismiss">
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QueueIcon({ status }: { status: QueueItem["status"] }) {
  if (status === "processing") return <LoaderCircle className="mt-0.5 size-3 shrink-0 animate-spin text-blue-600" />;
  if (status === "created") return <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />;
  if (status === "error") return <AlertCircle className="mt-0.5 size-3 shrink-0 text-red-600" />;
  return <Clock3 className="mt-0.5 size-3 shrink-0 text-zinc-400" />;
}
