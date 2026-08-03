"use client";

import { Check, Download, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { importOnboardingTemplateCsv } from "@/actions/onboarding-templates";

function deriveTemplateName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || "Imported onboarding";
}

export function OnboardingTemplateCsvImporter() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [csvText, setCsvText] = useState("");
  const [fileLabel, setFileLabel] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function loadFile(file: File) {
    const text = await file.text();
    setCsvText(text);
    setFileLabel(file.name);
    setError(null);
    setMessage(null);
    setName((current) => current || deriveTemplateName(file.name));
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setName("");
    setDescription("");
    setCsvText("");
    setFileLabel("");
    setIsDefault(false);
    setError(null);
    setMessage(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function submit() {
    if (pending) return;

    startTransition(async () => {
      setError(null);
      setMessage(null);

      const formData = new FormData();
      formData.set("name", name);
      formData.set("description", description);
      formData.set("csv_text", csvText);
      if (isDefault) formData.set("is_default", "on");

      const result = await importOnboardingTemplateCsv(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(result.message);
      router.refresh();
      close();
    });
  }

  if (!open) {
    return (
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
    );
  }

  return (
    <div className="border border-zinc-200 bg-zinc-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-950">
            Import onboarding template
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
            Upload or paste CSV, then save it as a reusable onboarding template.
          </p>
        </div>
        <a
          href="/settings/onboarding-import-template"
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 hover:text-zinc-700"
        >
          <Download className="size-3.5" />
          Template
        </a>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-start">
        <label className="text-sm font-medium">
          Template name
          <input
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Imported onboarding"
            className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium">
          Description
          <input
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            placeholder="Optional internal note"
            className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 pt-8 text-sm font-medium">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(event) => setIsDefault(event.currentTarget.checked)}
          />
          Agency default
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            await loadFile(file);
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="ui-action"
        >
          <Upload className="size-3.5" />
          {fileLabel || "Choose CSV"}
        </button>
        <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
          or paste CSV below
        </span>
      </div>

      <label className="mt-4 block text-sm font-medium">
        CSV content
        <textarea
          rows={10}
          value={csvText}
          onChange={(event) => setCsvText(event.currentTarget.value)}
          placeholder="Paste onboarding template CSV here"
          className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2 font-mono text-xs leading-5"
        />
      </label>

      <p className="mt-2 text-xs leading-5 text-zinc-500">
        Give the downloadable template to AI and ask it to return CSV in the same format.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="ui-action ui-action-primary disabled:opacity-50"
        >
          <Check className="size-3.5" />
          {pending ? "Importing..." : "Import template"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={close}
          className="ui-action disabled:opacity-50"
        >
          <X className="size-3.5" />
          Cancel
        </button>
      </div>

      {error && <p className="mt-3 text-xs leading-5 text-red-600">{error}</p>}
      {message && <p className="mt-3 text-xs leading-5 text-emerald-700">{message}</p>}
    </div>
  );
}
