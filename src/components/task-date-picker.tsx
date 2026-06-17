"use client";

import { CalendarDays, X } from "lucide-react";
import { useRef } from "react";

export function TaskDatePicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    if (disabled) return;
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  }

  return (
    <div className={`relative flex items-center gap-2 border border-zinc-300 bg-white text-left hover:border-blue-500 ${compact ? "min-w-28 px-2 py-1 text-[10px]" : "w-full px-3 py-2 text-xs"}`}>
      <CalendarDays className="size-3.5 shrink-0 text-blue-600" />
      <button type="button" disabled={disabled} onClick={openPicker} className="min-w-0 flex-1 truncate text-left normal-case tracking-normal text-zinc-700 disabled:opacity-50">
        {value || "Set date"}
      </button>
      {value && (
        <button type="button" disabled={disabled} onClick={() => onChange("")} className="relative z-10 text-zinc-300 hover:text-red-600" aria-label="Clear date">
          <X className="size-3" />
        </button>
      )}
      <input
        ref={inputRef}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="pointer-events-none absolute inset-0 size-full opacity-0"
        tabIndex={-1}
      />
    </div>
  );
}
