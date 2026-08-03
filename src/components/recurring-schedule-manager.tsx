"use client";

import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, Repeat2, Rows3 } from "lucide-react";
import { useMemo, useState } from "react";
import { createRecurringRule } from "@/actions/crm";
import { ActionForm } from "@/components/action-form";
import { TaskDateRangePicker } from "@/components/task-date-range-picker";
import type { Member } from "@/components/task-table";
import { TASK_PRIORITIES } from "@/lib/constants";
import { advanceRecurringDate, recurringOccurrence } from "@/lib/recurrence";
import { formatLabel } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Frequency = "daily" | "weekly" | "monthly";
type ViewMode = "calendar" | "upcoming" | "rules";

export type RecurringRule = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  assignee_id: string | null;
  frequency: Frequency;
  interval_count: number;
  next_run_at: string;
  due_offset_days: number;
  skip_weekends: boolean;
  active: boolean;
};

type PreviewRule = Pick<
  RecurringRule,
  "id" | "title" | "frequency" | "interval_count" | "next_run_at" | "due_offset_days" | "skip_weekends" | "active"
> & { draft?: boolean };

type Occurrence = {
  id: string;
  ruleId: string;
  title: string;
  start: string;
  due: string;
  draft: boolean;
};

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

function moveMonth(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1, 12));
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDate(value));
}

function daysBetween(start: string, due: string) {
  return Math.max(0, Math.round((parseDate(due).getTime() - parseDate(start).getTime()) / 86400000));
}

function scheduleLabel(rule: PreviewRule) {
  const units: Record<Frequency, [string, string]> = {
    daily: ["day", "days"],
    weekly: ["week", "weeks"],
    monthly: ["month", "months"],
  };
  const unit = units[rule.frequency][rule.interval_count === 1 ? 0 : 1];
  return `Every ${rule.interval_count === 1 ? "" : `${rule.interval_count} `}${unit}${rule.skip_weekends ? " · weekdays only" : ""}`;
}

function occurrenceCount(rule: PreviewRule, count: number) {
  if (!rule.active) return [];
  const result: Occurrence[] = [];
  let cursor = rule.next_run_at;

  for (let index = 0; index < count; index += 1) {
    const occurrence = recurringOccurrence(cursor, rule.due_offset_days, rule.skip_weekends);
    result.push({
      id: `${rule.id}-${occurrence.occurrenceDate}`,
      ruleId: rule.id,
      title: rule.title,
      start: occurrence.occurrenceDate,
      due: occurrence.dueDate,
      draft: Boolean(rule.draft),
    });
    cursor = advanceRecurringDate(
      occurrence.occurrenceDate,
      rule.frequency,
      rule.interval_count,
      rule.skip_weekends,
    );
  }

  return result;
}

function occurrencesThrough(rule: PreviewRule, endDate: string) {
  if (!rule.active) return [];
  const result: Occurrence[] = [];
  let cursor = rule.next_run_at;

  for (let index = 0; index < 750 && cursor <= endDate; index += 1) {
    const occurrence = recurringOccurrence(cursor, rule.due_offset_days, rule.skip_weekends);
    result.push({
      id: `${rule.id}-${occurrence.occurrenceDate}`,
      ruleId: rule.id,
      title: rule.title,
      start: occurrence.occurrenceDate,
      due: occurrence.dueDate,
      draft: Boolean(rule.draft),
    });
    cursor = advanceRecurringDate(
      occurrence.occurrenceDate,
      rule.frequency,
      rule.interval_count,
      rule.skip_weekends,
    );
  }

  return result;
}

export function RecurringScheduleManager({
  clientId,
  recurringListId,
  members,
  rules,
  today,
}: {
  clientId: string;
  recurringListId: string;
  members: Member[];
  rules: RecurringRule[];
  today: string;
}) {
  const [view, setView] = useState<ViewMode>("calendar");
  const [formOpen, setFormOpen] = useState(rules.length === 0);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(parseDate(today)));
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [intervalCount, setIntervalCount] = useState(1);
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [dates, setDates] = useState({ start: today, due: today });

  const previewRules = useMemo<PreviewRule[]>(() => {
    const savedRules = rules.map((rule) => ({ ...rule, draft: false }));
    if (!title.trim()) return savedRules;
    return [
      ...savedRules,
      {
        id: "draft",
        title: title.trim(),
        frequency,
        interval_count: Math.max(1, intervalCount),
        next_run_at: dates.start,
        due_offset_days: daysBetween(dates.start, dates.due),
        skip_weekends: skipWeekends,
        active: true,
        draft: true,
      },
    ];
  }, [dates.due, dates.start, frequency, intervalCount, rules, skipWeekends, title]);

  const calendarDays = useMemo(() => {
    const firstDay = startOfWeek(monthStart(visibleMonth));
    return Array.from({ length: 42 }, (_, index) => addDays(firstDay, index));
  }, [visibleMonth]);
  const calendarEnd = dateValue(calendarDays.at(-1) ?? visibleMonth);
  const calendarOccurrences = useMemo(
    () => previewRules.flatMap((rule) => occurrencesThrough(rule, calendarEnd)),
    [calendarEnd, previewRules],
  );
  const occurrencesByDay = useMemo(() => {
    const result = new Map<string, Occurrence[]>();
    calendarOccurrences.forEach((occurrence) => {
      const existing = result.get(occurrence.start) ?? [];
      existing.push(occurrence);
      result.set(occurrence.start, existing);
    });
    return result;
  }, [calendarOccurrences]);
  const upcoming = useMemo(
    () => previewRules
      .flatMap((rule) => occurrenceCount(rule, 12))
      .sort((left, right) => left.start.localeCompare(right.start) || left.title.localeCompare(right.title))
      .slice(0, 30),
    [previewRules],
  );
  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.user_id, member.display_name || member.email || "Member"])),
    [members],
  );

  return (
    <section className="border-y border-zinc-950 bg-white">
      <header className="flex flex-col gap-4 border-b px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Repeat2 className="size-4 text-blue-600" />
            <h2 className="ui-section-title">Recurring schedule</h2>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
            Preview the next scheduled runs. Recurring tasks keep one thread and reset to the next run when completed.
          </p>
        </div>
        <div className="flex w-fit border border-zinc-200">
          <ModeButton active={view === "calendar"} onClick={() => setView("calendar")} icon={CalendarDays}>Calendar</ModeButton>
          <ModeButton active={view === "upcoming"} onClick={() => setView("upcoming")} icon={Rows3}>Upcoming</ModeButton>
          <ModeButton active={view === "rules"} onClick={() => setView("rules")} icon={List}>Rules</ModeButton>
        </div>
      </header>

      <details className="border-b" open={formOpen} onToggle={(event) => setFormOpen(event.currentTarget.open)}>
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500 hover:text-zinc-950">
          <Plus className="size-3.5" />
          Add recurring task
        </summary>
        <ActionForm action={createRecurringRule} className="grid gap-4 border-t bg-zinc-50/60 p-4 md:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="task_list_id" value={recurringListId} />
          <input type="hidden" name="first_start_date" value={dates.start} />
          <input type="hidden" name="first_due_date" value={dates.due} />
          <label className="xl:col-span-2">
            Title
            <input
              name="title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Weekly campaign performance review"
              className="mt-1.5 w-full border px-3 py-2 text-sm"
            />
          </label>
          <label>
            Frequency
            <select
              name="frequency"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as Frequency)}
              className="mt-1.5 w-full border px-3 py-2 text-sm"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label>
            Repeat every
            <div className="mt-1.5 flex border bg-white">
              <input
                name="interval_count"
                type="number"
                min="1"
                value={intervalCount}
                onChange={(event) => setIntervalCount(Math.max(1, Number(event.target.value) || 1))}
                className="min-w-0 flex-1 border-0 px-3 py-2 text-sm"
              />
              <span className="border-l px-3 py-2 text-xs text-zinc-500">
                {{ daily: "days", weekly: "weeks", monthly: "months" }[frequency]}
              </span>
            </div>
          </label>
          <div className="md:col-span-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em]">First occurrence dates</p>
            <TaskDateRangePicker
              startDate={dates.start}
              dueDate={dates.due}
              allowClear={false}
              onChange={(start, due) => setDates({ start, due })}
            />
          </div>
          <label>
            Priority
            <select name="priority" defaultValue="normal" className="mt-1.5 w-full border px-3 py-2 text-sm">
              {TASK_PRIORITIES.map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}
            </select>
          </label>
          <label>
            Assignee
            <select name="assignee_id" className="mt-1.5 w-full border px-3 py-2 text-sm">
              <option value="">Unassigned</option>
              {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.email}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end border border-zinc-200 bg-white px-3 py-2.5">
            <input
              name="skip_weekends"
              type="checkbox"
              checked={skipWeekends}
              onChange={(event) => setSkipWeekends(event.target.checked)}
              className="size-4"
            />
            Avoid weekends
          </label>
          <label className="md:col-span-2 xl:col-span-4">
            Description
            <textarea name="description" rows={3} className="mt-1.5 w-full border px-3 py-2 text-sm" />
          </label>
          <button className="ui-action ui-action-primary w-fit">Create recurring rule</button>
          {title.trim() && (
            <p className="self-center text-[10px] uppercase tracking-[0.08em] text-violet-600">
              Draft is shown in the preview
            </p>
          )}
        </ActionForm>
      </details>

      {view === "calendar" && (
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="flex items-center justify-between border-b px-3 py-3">
              <button type="button" onClick={() => setVisibleMonth((month) => moveMonth(month, -1))} className="p-2 text-zinc-400 hover:text-zinc-950" aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </button>
              <p className="text-xs font-semibold uppercase tracking-[0.08em]">{monthLabel(visibleMonth)}</p>
              <button type="button" onClick={() => setVisibleMonth((month) => moveMonth(month, 1))} className="p-2 text-zinc-400 hover:text-zinc-950" aria-label="Next month">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 bg-zinc-50 text-center">
              {WEEKDAYS.map((weekday) => <span key={weekday} className="border-b border-r py-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-400">{weekday}</span>)}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((date) => {
                const value = dateValue(date);
                const occurrences = occurrencesByDay.get(value) ?? [];
                const currentMonth = date.getUTCMonth() === visibleMonth.getUTCMonth();
                return (
                  <div key={value} className={`min-h-24 border-b border-r p-1.5 ${currentMonth ? "bg-white" : "bg-zinc-50/70"}`}>
                    <div className={`mb-1 text-[10px] ${value === today ? "font-semibold text-blue-600" : currentMonth ? "text-zinc-600" : "text-zinc-300"}`}>
                      {date.getUTCDate()}
                    </div>
                    <div className="space-y-1">
                      {occurrences.slice(0, 2).map((occurrence) => (
                        <div
                          key={occurrence.id}
                          title={`${occurrence.title}: ${shortDate(occurrence.start)} to ${shortDate(occurrence.due)}`}
                          className={`truncate border-l-2 px-1.5 py-1 text-[9px] leading-3 ${occurrence.draft ? "border-violet-500 bg-violet-50 text-violet-700" : "border-blue-500 bg-blue-50 text-blue-800"}`}
                        >
                          {occurrence.title}
                        </div>
                      ))}
                      {occurrences.length > 2 && <p className="px-1 text-[9px] text-zinc-400">+{occurrences.length - 2} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {view === "upcoming" && (
        <div className="divide-y">
          {!upcoming.length && <p className="px-4 py-10 text-center text-xs text-zinc-400">No active recurring occurrences to preview.</p>}
          {upcoming.map((occurrence) => (
            <div key={occurrence.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem] md:items-center">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`size-1.5 shrink-0 ${occurrence.draft ? "bg-violet-500" : "bg-blue-500"}`} />
                <p className="truncate text-sm font-medium">{occurrence.title}</p>
                {occurrence.draft && <span className="text-[9px] uppercase tracking-[0.08em] text-violet-600">Draft</span>}
              </div>
              <p className="text-xs text-zinc-500"><span className="mr-2 text-[9px] uppercase tracking-[0.08em] text-zinc-400">Start</span>{shortDate(occurrence.start)}</p>
              <p className="text-xs text-zinc-500"><span className="mr-2 text-[9px] uppercase tracking-[0.08em] text-zinc-400">Due</span>{shortDate(occurrence.due)}</p>
            </div>
          ))}
        </div>
      )}

      {view === "rules" && (
        <div className="overflow-x-auto">
          {!rules.length ? (
            <p className="px-4 py-10 text-center text-xs text-zinc-400">No recurring rules yet.</p>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-zinc-50 text-[9px] uppercase tracking-[0.08em] text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Rule</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Next start</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">State</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="px-4 py-3 font-medium">{rule.title}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{scheduleLabel(rule)}</td>
                    <td className="px-4 py-3 text-xs">{shortDate(rule.next_run_at)}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{rule.due_offset_days === 0 ? "Same day" : `Start + ${rule.due_offset_days} days`}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{rule.assignee_id ? memberNames.get(rule.assignee_id) ?? "Former member" : "Unassigned"}</td>
                    <td className="px-4 py-3"><span className={`text-[9px] font-semibold uppercase tracking-[0.08em] ${rule.active ? "text-emerald-700" : "text-zinc-400"}`}>{rule.active ? "Active" : "Paused"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CalendarDays;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-r px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] last:border-r-0 ${active ? "bg-blue-600 text-white" : "text-zinc-400 hover:bg-zinc-50 hover:text-zinc-950"}`}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}
