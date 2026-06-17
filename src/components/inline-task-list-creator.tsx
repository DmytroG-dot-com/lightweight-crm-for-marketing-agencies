"use client";

import { Check, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createTaskList } from "@/actions/crm";

export function InlineTaskListCreator({ clientId }: { clientId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function showInput() {
    setOpen(true);
    setError("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeInput() {
    if (pending) return;
    setOpen(false);
    setName("");
    setError("");
  }

  function submit() {
    const trimmedName = name.trim();
    if (!trimmedName || pending) return;
    setError("");
    const formData = new FormData();
    formData.set("client_id", clientId);
    formData.set("name", trimmedName);
    startTransition(async () => {
      try {
        const result = await createTaskList(formData);
        router.push(`/clients/${clientId}?tab=tasks&list=${result.listId}`);
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not create list.");
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={showInput}
        className="flex items-center gap-1 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-300 hover:text-zinc-700"
      >
        <Plus className="size-3" />Add list
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 py-2" title={error || undefined}>
      <Plus className="size-3 shrink-0 text-zinc-300" />
      <input
        ref={inputRef}
        value={name}
        disabled={pending}
        maxLength={100}
        placeholder="List name"
        aria-label="New list name"
        aria-invalid={Boolean(error)}
        onChange={(event) => setName(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeInput();
          }
        }}
        className="w-28 border-0 border-b border-zinc-300 bg-transparent px-0 py-1 text-[10px] text-zinc-700 placeholder:text-zinc-300 focus:border-zinc-700 disabled:opacity-50"
      />
      <button
        type="button"
        disabled={pending || !name.trim()}
        onClick={submit}
        className="p-1 text-zinc-300 hover:text-emerald-600 disabled:opacity-30"
        aria-label="Create list"
      >
        <Check className="size-3" />
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={closeInput}
        className="p-1 text-zinc-300 hover:text-zinc-700 disabled:opacity-30"
        aria-label="Cancel creating list"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
