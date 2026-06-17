"use client";

import { useState, useTransition } from "react";
import { updateCreativeField } from "@/actions/creative";
import { CREATIVE_STATUSES } from "@/lib/constants";
import { formatLabel } from "@/lib/utils";

const creativeStatusTone: Record<string, string> = {
  draft: "border-zinc-300 bg-zinc-50 text-zinc-600",
  assigned: "border-blue-300 bg-blue-50 text-blue-700",
  in_progress: "border-blue-300 bg-blue-50 text-blue-700",
  review: "border-amber-300 bg-amber-50 text-amber-800",
  approved: "border-emerald-300 bg-emerald-50 text-emerald-700",
  launched: "border-emerald-300 bg-emerald-50 text-emerald-700",
  stopped: "border-zinc-400 bg-zinc-100 text-zinc-600",
};

function useCreativeFieldUpdate(requestId: string) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(field: string, value: string, onError?: () => void) {
    const formData = new FormData();
    formData.set("request_id", requestId);
    formData.set("field", field);
    formData.set("value", value);
    setError(null);
    startTransition(async () => {
      try {
        await updateCreativeField(formData);
      } catch (updateError) {
        onError?.();
        setError(updateError instanceof Error ? updateError.message : "Could not save change.");
      }
    });
  }

  return { error, pending, update };
}

export function CreativeStatusSelect({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const { error, pending, update } = useCreativeFieldUpdate(requestId);
  const [value, setValue] = useState(status);

  return (
    <select
      value={value}
      disabled={pending}
      aria-invalid={Boolean(error)}
      title={error ?? undefined}
      onChange={(event) => {
        const previous = value;
        const next = event.currentTarget.value;
        setValue(next);
        update("status", next, () => setValue(previous));
      }}
      className={`w-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50 ${creativeStatusTone[value] ?? creativeStatusTone.draft}`}
    >
      {CREATIVE_STATUSES.map((option) => <option key={option} value={option}>{formatLabel(option)}</option>)}
    </select>
  );
}

export function CreativeCreatorSelect({
  requestId,
  creatorId,
  creators,
}: {
  requestId: string;
  creatorId: string | null;
  creators: Array<{ id: string; name: string; active?: boolean | null }>;
}) {
  const { error, pending, update } = useCreativeFieldUpdate(requestId);
  const [value, setValue] = useState(creatorId ?? "");

  return (
    <select
      value={value}
      disabled={pending}
      aria-invalid={Boolean(error)}
      title={error ?? undefined}
      onChange={(event) => {
        const previous = value;
        const next = event.currentTarget.value;
        setValue(next);
        update("creator_id", next, () => setValue(previous));
      }}
      className="w-full border-0 border-b border-zinc-300 bg-transparent px-0 py-1 text-[10px] uppercase tracking-wide disabled:opacity-50"
    >
      <option value="">Unassigned</option>
      {creators.map((creator) => (
        <option key={creator.id} value={creator.id}>
          {creator.name}{creator.active === false ? " (inactive)" : ""}
        </option>
      ))}
    </select>
  );
}

export function CreativeDueDateInput({
  requestId,
  dueDate,
}: {
  requestId: string;
  dueDate: string;
}) {
  const { error, pending, update } = useCreativeFieldUpdate(requestId);
  const [value, setValue] = useState(dueDate);

  return (
    <input
      type="date"
      value={value}
      disabled={pending}
      aria-invalid={Boolean(error)}
      title={error ?? undefined}
      onChange={(event) => {
        const previous = value;
        const next = event.currentTarget.value;
        setValue(next);
        update("due_date", next, () => setValue(previous));
      }}
      className="w-full border-0 border-b border-zinc-300 bg-transparent px-0 py-1 text-xs text-zinc-700 outline-none disabled:opacity-50"
    />
  );
}
