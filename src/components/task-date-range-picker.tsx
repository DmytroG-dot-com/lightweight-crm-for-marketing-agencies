"use client";

import { CalendarRange, ChevronLeft, ChevronRight, Repeat2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { getTaskRecurrence, setTaskRecurrence, stopTaskRecurrence } from "@/actions/crm";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function dateValue(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const day = date.getUTCDay() || 7;
  return addDays(date, 1 - day);
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function shortDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDate(value));
}

function todayValue() {
  return dateValue(new Date());
}

export function TaskDateRangePicker({
  startDate,
  dueDate,
  onChange,
  disabled = false,
  compactField,
  allowClear = true,
  recurrenceTask,
  onRecurrenceSaved,
  onRecurrenceStopped,
}: {
  startDate: string;
  dueDate: string;
  onChange: (startDate: string, dueDate: string) => void;
  disabled?: boolean;
  compactField?: "start" | "due";
  allowClear?: boolean;
  recurrenceTask?: { clientId: string; taskId: string; isRecurring: boolean };
  onRecurrenceSaved?: (result: { recurringListId: string; startDate: string; dueDate: string }) => void;
  onRecurrenceStopped?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftDue, setDraftDue] = useState(dueDate);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(parseDate(startDate || dueDate || todayValue())));
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [isRecurring, setIsRecurring] = useState(recurrenceTask?.isRecurring ?? false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [intervalCount, setIntervalCount] = useState(1);
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [recurrenceMessage, setRecurrenceMessage] = useState("");
  const [recurrencePending, startRecurrenceTransition] = useTransition();

  function openPicker() {
    if (disabled) return;
    setDraftStart(startDate);
    setDraftDue(dueDate);
    setVisibleMonth(monthStart(parseDate(startDate || dueDate || todayValue())));
    setRecurrenceOpen(false);
    setRecurrenceMessage("");
    setOpen(true);
  }

  function applyRange(nextStart: string, nextDue: string) {
    setDraftStart(nextStart);
    setDraftDue(nextDue);
    setOpen(false);
    onChange(nextStart, nextDue);
  }

  function openRecurrenceSettings() {
    if (!recurrenceTask) return;
    const fallbackStart = draftStart || todayValue();
    setDraftStart(fallbackStart);
    setDraftDue(draftDue || fallbackStart);
    setRecurrenceOpen(true);
    setRecurrenceMessage("");
    if (!isRecurring) return;

    startRecurrenceTransition(async () => {
      try {
        const rule = await getTaskRecurrence(recurrenceTask);
        if (!rule) {
          setIsRecurring(false);
          return;
        }
        setIsRecurring(rule.active);
        setFrequency(rule.frequency as "daily" | "weekly" | "monthly");
        setIntervalCount(rule.interval_count);
        setSkipWeekends(rule.skip_weekends);
      } catch (error) {
        setRecurrenceMessage(error instanceof Error ? error.message : "Could not load recurring settings.");
      }
    });
  }

  function saveRecurrence() {
    if (!recurrenceTask) return;
    setRecurrenceMessage("");
    startRecurrenceTransition(async () => {
      try {
        const result = await setTaskRecurrence({
          ...recurrenceTask,
          startDate: draftStart,
          dueDate: draftDue,
          frequency,
          intervalCount,
          skipWeekends,
        });
        setDraftStart(result.startDate);
        setDraftDue(result.dueDate);
        setIsRecurring(true);
        onRecurrenceSaved?.(result);
        setOpen(false);
      } catch (error) {
        setRecurrenceMessage(error instanceof Error ? error.message : "Could not save recurring settings.");
      }
    });
  }

  function stopRecurrence() {
    if (!recurrenceTask) return;
    setRecurrenceMessage("");
    startRecurrenceTransition(async () => {
      try {
        await stopTaskRecurrence(recurrenceTask);
        setIsRecurring(false);
        onRecurrenceStopped?.();
        setRecurrenceOpen(false);
      } catch (error) {
        setRecurrenceMessage(error instanceof Error ? error.message : "Could not stop recurrence.");
      }
    });
  }

  function chooseDate(value: string) {
    if (!draftStart || draftDue) {
      setDraftStart(value);
      setDraftDue("");
      return;
    }

    if (value < draftStart) applyRange(value, draftStart);
    else applyRange(draftStart, value);
  }

  function applyPreset(kind: "today" | "tomorrow" | "this-week" | "next-week") {
    const today = parseDate(todayValue());
    if (kind === "today") {
      const value = dateValue(today);
      applyRange(value, value);
      return;
    }
    if (kind === "tomorrow") {
      const value = dateValue(addDays(today, 1));
      applyRange(value, value);
      return;
    }
    const weekStart = startOfWeek(today);
    const start = kind === "next-week" ? addDays(weekStart, 7) : today;
    const due = kind === "next-week" ? addDays(weekStart, 13) : addDays(weekStart, 6);
    applyRange(dateValue(start), dateValue(due));
  }

  const firstCalendarDate = startOfWeek(monthStart(visibleMonth));
  const calendarDays = Array.from({ length: 42 }, (_, index) => addDays(firstCalendarDate, index));
  const today = todayValue();

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        aria-label="Edit task date range"
        className={`flex items-center border border-zinc-300 bg-white text-left hover:border-blue-500 disabled:opacity-50 ${
          compactField ? "min-w-28 gap-2 px-2 py-1 text-[10px]" : "w-full gap-3 px-3 py-2"
        }`}
      >
        <CalendarRange className={`${compactField ? "size-3.5" : "size-4"} shrink-0 text-blue-600`} />
        {compactField ? (
          <span className="truncate normal-case tracking-normal text-zinc-700">
            {(compactField === "start" ? startDate : dueDate) || "Set date"}
          </span>
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Start</span>
              <span className="block truncate text-xs text-zinc-800">{shortDate(startDate)}</span>
            </span>
            <span className="text-zinc-300">→</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Due</span>
              <span className="block truncate text-xs text-zinc-800">{shortDate(dueDate)}</span>
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/20 p-3" onMouseDown={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Select task date range"
            className="w-full max-w-[390px] border border-zinc-950 bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-zinc-950 px-4 py-3">
              <div>
                <p className="ui-kicker">{recurrenceOpen ? "Recurring schedule" : "Task dates"}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {recurrenceOpen
                    ? "Recurring tasks reset in place when completed, keeping comments and context on the same task"
                    : draftStart && !draftDue ? "Select the due date" : "Select the start date, then the due date"}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-950" aria-label="Close calendar">
                <X className="size-4" />
              </button>
            </header>

            <div className="grid grid-cols-2 border-b">
              <div className="border-r px-4 py-3">
                <p className="ui-kicker">Start</p>
                <p className="mt-1 text-xs">{shortDate(draftStart)}</p>
              </div>
              <div className="px-4 py-3">
                <p className="ui-kicker">Due</p>
                <p className="mt-1 text-xs">{shortDate(draftDue)}</p>
              </div>
            </div>

            {recurrenceOpen ? (
              <RecurringSettings
                frequency={frequency}
                intervalCount={intervalCount}
                skipWeekends={skipWeekends}
                isRecurring={isRecurring}
                pending={recurrencePending}
                message={recurrenceMessage}
                onFrequencyChange={setFrequency}
                onIntervalChange={setIntervalCount}
                onSkipWeekendsChange={setSkipWeekends}
                onBack={() => setRecurrenceOpen(false)}
                onSave={saveRecurrence}
                onStop={stopRecurrence}
              />
            ) : (
              <>
                <div className="flex items-center justify-between px-3 py-3">
                  <button type="button" onClick={() => setVisibleMonth(monthStart(addDays(visibleMonth, -1)))} className="p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950" aria-label="Previous month">
                    <ChevronLeft className="size-4" />
                  </button>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em]">{monthLabel(visibleMonth)}</p>
                  <button type="button" onClick={() => setVisibleMonth(new Date(Date.UTC(visibleMonth.getUTCFullYear(), visibleMonth.getUTCMonth() + 1, 1, 12)))} className="p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950" aria-label="Next month">
                    <ChevronRight className="size-4" />
                  </button>
                </div>

                <div className="grid grid-cols-7 px-3 text-center">
                  {WEEKDAYS.map((weekday) => <span key={weekday} className="py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-400">{weekday}</span>)}
                  {calendarDays.map((date) => {
                    const value = dateValue(date);
                    const isEndpoint = value === draftStart || value === draftDue;
                    const isInRange = Boolean(draftStart && draftDue && value > draftStart && value < draftDue);
                    const isCurrentMonth = date.getUTCMonth() === visibleMonth.getUTCMonth();
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => chooseDate(value)}
                        className={`relative grid aspect-square place-items-center border text-xs transition-colors ${
                          isEndpoint
                            ? "border-blue-600 bg-blue-600 font-semibold text-white"
                            : isInRange
                              ? "border-blue-100 bg-blue-50 text-blue-800 hover:border-blue-400"
                              : "border-transparent hover:border-blue-400 hover:bg-blue-50"
                        } ${isCurrentMonth ? "" : "text-zinc-300"} ${value === today && !isEndpoint ? "font-semibold text-blue-700" : ""}`}
                        aria-label={shortDate(value)}
                      >
                        {date.getUTCDate()}
                      </button>
                    );
                  })}
                </div>

                <footer className="mt-3 flex flex-wrap gap-2 border-t px-3 py-3">
                  {recurrenceTask && (
                    <button
                      type="button"
                      onClick={openRecurrenceSettings}
                      className={`ui-action flex items-center gap-1.5 ${isRecurring ? "border-violet-500 text-violet-700" : ""}`}
                    >
                      <Repeat2 className="size-3.5" />{isRecurring ? "Recurring" : "Make recurring"}
                    </button>
                  )}
                  <button type="button" onClick={() => applyPreset("today")} className="ui-action">Today</button>
                  <button type="button" onClick={() => applyPreset("tomorrow")} className="ui-action">Tomorrow</button>
                  <button type="button" onClick={() => applyPreset("this-week")} className="ui-action">This week</button>
                  <button type="button" onClick={() => applyPreset("next-week")} className="ui-action">Next week</button>
                  {allowClear && (
                    <button type="button" onClick={() => applyRange("", "")} className="ml-auto px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 hover:text-red-600">
                      Clear
                    </button>
                  )}
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function RecurringSettings({
  frequency,
  intervalCount,
  skipWeekends,
  isRecurring,
  pending,
  message,
  onFrequencyChange,
  onIntervalChange,
  onSkipWeekendsChange,
  onBack,
  onSave,
  onStop,
}: {
  frequency: "daily" | "weekly" | "monthly";
  intervalCount: number;
  skipWeekends: boolean;
  isRecurring: boolean;
  pending: boolean;
  message: string;
  onFrequencyChange: (value: "daily" | "weekly" | "monthly") => void;
  onIntervalChange: (value: number) => void;
  onSkipWeekendsChange: (value: boolean) => void;
  onBack: () => void;
  onSave: () => void;
  onStop: () => void;
}) {
  const unit = { daily: "days", weekly: "weeks", monthly: "months" }[frequency];
  return (
    <div>
      <div className="space-y-5 px-4 py-5">
        <div>
          <p className="ui-kicker mb-2">Schedule</p>
          <div className="grid grid-cols-3 border">
            {(["daily", "weekly", "monthly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={pending}
                onClick={() => onFrequencyChange(value)}
                className={`border-r px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] last:border-r-0 ${frequency === value ? "bg-blue-600 text-white" : "text-zinc-500 hover:bg-zinc-50"}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          Repeat every
          <div className="mt-1.5 flex border">
            <input
              type="number"
              min="1"
              max="365"
              value={intervalCount}
              disabled={pending}
              onChange={(event) => onIntervalChange(Math.max(1, Number(event.currentTarget.value) || 1))}
              className="min-w-0 flex-1 border-0 px-3 py-2 text-sm"
            />
            <span className="border-l px-3 py-2 text-xs text-zinc-500">{unit}</span>
          </div>
        </label>
        <label className="flex items-center gap-2 border px-3 py-3">
          <input type="checkbox" checked={skipWeekends} disabled={pending} onChange={(event) => onSkipWeekendsChange(event.currentTarget.checked)} className="size-4" />
          Avoid weekends
        </label>
        <div className="grid grid-cols-2 gap-px border bg-zinc-200">
          <div className="bg-white px-3 py-3"><p className="ui-kicker">Recur</p><p className="mt-1 text-xs">On schedule</p></div>
          <div className="bg-white px-3 py-3"><p className="ui-kicker">Future instances</p><p className="mt-1 text-xs">Create new task</p></div>
        </div>
        <p className="text-[10px] leading-4 text-zinc-400">
          Repeats forever using the selected start date. The due date keeps the same distance from the start date.
        </p>
        {message && <p className="text-xs text-red-600">{message}</p>}
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <button type="button" disabled={pending} onClick={onBack} className="ui-action">Back</button>
        <button type="button" disabled={pending} onClick={onSave} className="ui-action ui-action-primary">
          {pending ? "Saving..." : isRecurring ? "Save recurrence" : "Make recurring"}
        </button>
        {isRecurring && <button type="button" disabled={pending} onClick={onStop} className="ml-auto px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-600">Stop recurring</button>}
      </footer>
    </div>
  );
}
