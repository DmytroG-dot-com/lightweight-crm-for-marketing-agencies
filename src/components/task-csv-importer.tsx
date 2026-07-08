"use client";

import { Check, Download, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { importTaskCsv } from "@/actions/task-import";

export function TaskCsvImporter({
  clientId,
  taskListId,
}: {
  clientId: string;
  taskListId?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
    setFile(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function submit() {
    if (!file || pending) return;

    startTransition(async () => {
      setError(null);

      try {
        const formData = new FormData();
        formData.set("client_id", clientId);
        if (taskListId) {
          formData.set("task_list_id", taskListId);
        }
        formData.set("file", file);

        const result = await importTaskCsv(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }

        if (inputRef.current) {
          inputRef.current.value = "";
        }
        setFile(null);
        setOpen(false);

        if (result.primaryListId) {
          router.push(`/clients/${clientId}?tab=tasks&list=${result.primaryListId}`);
        }
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not import this CSV.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
        className="flex items-center gap-1 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-300 hover:text-zinc-700"
      >
        <Upload className="size-3" />
        Import CSV
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-1">
        <Upload className="size-3 shrink-0 text-zinc-300" />
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            setError(null);
            setFile(event.currentTarget.files?.[0] ?? null);
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="max-w-36 truncate border-0 border-b border-zinc-300 bg-transparent px-0 py-1 text-[10px] text-zinc-700 hover:border-zinc-700 disabled:opacity-50"
        >
          {file?.name || "Choose CSV"}
        </button>
        <a
          href={`/clients/${clientId}/task-import-template`}
          className="flex items-center gap-1 p-1 text-zinc-300 hover:text-zinc-700"
          title="Download CSV template"
        >
          <Download className="size-3" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em]">Template</span>
        </a>
        <button
          type="button"
          disabled={pending || !file}
          onClick={submit}
          className="p-1 text-zinc-300 hover:text-emerald-600 disabled:opacity-30"
          aria-label="Import CSV"
        >
          <Check className="size-3" />
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={close}
          className="p-1 text-zinc-300 hover:text-zinc-700 disabled:opacity-30"
          aria-label="Cancel CSV import"
        >
          <X className="size-3" />
        </button>
      </div>
      {error && <p className="max-w-sm text-[10px] leading-4 text-red-600">{error}</p>}
    </div>
  );
}
