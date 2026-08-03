"use client";

import { Check, Download, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { importPersonaCsv } from "@/actions/persona-import";

export function PersonaCsvImporter({ clientId }: { clientId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resetFile() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
    resetFile();
  }

  function submit() {
    if (!file || pending) return;

    startTransition(async () => {
      setError(null);
      setMessage(null);

      try {
        const formData = new FormData();
        formData.set("client_id", clientId);
        formData.set("file", file);
        const result = await importPersonaCsv(formData);

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setMessage(result.message);
        resetFile();
        setOpen(false);
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not import this CSV.");
      }
    });
  }

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError(null);
            setMessage(null);
          }}
          className="ui-action"
        >
          <Upload className="size-3.5" />
          Import CSV
        </button>
        {message && <p className="text-[10px] leading-4 text-emerald-700" aria-live="polite">{message}</p>}
      </div>
    );
  }

  return (
    <div className="w-full border border-zinc-200 bg-zinc-50/60 p-3 sm:max-w-xl">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            setError(null);
            setMessage(null);
            setFile(event.currentTarget.files?.[0] ?? null);
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="ui-action max-w-56 disabled:opacity-50"
        >
          <Upload className="size-3.5 shrink-0" />
          <span className="truncate">{file?.name || "Choose CSV"}</span>
        </button>
        <a href={`/clients/${clientId}/persona-import-template`} className="ui-action">
          <Download className="size-3.5" />
          Template
        </a>
        <button
          type="button"
          disabled={pending || !file}
          onClick={submit}
          className="ui-action ui-action-primary disabled:opacity-50"
        >
          <Check className="size-3.5" />
          {pending ? "Importing..." : "Import"}
        </button>
        <button type="button" disabled={pending} onClick={close} className="ui-action disabled:opacity-50">
          <X className="size-3.5" />
          Cancel
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-zinc-500">
        Adds one persona per row. List fields can use <span className="font-mono">|</span> between items.
      </p>
      {error && <p className="mt-2 text-xs leading-5 text-red-600" aria-live="polite">{error}</p>}
    </div>
  );
}
