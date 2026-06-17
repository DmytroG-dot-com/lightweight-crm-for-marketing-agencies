export function moveToWeekday(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function addDateDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function advanceRecurringDate(value: string, frequency: string, interval: number, skipWeekends: boolean) {
  const date = new Date(`${value}T12:00:00Z`);
  if (frequency === "daily") date.setUTCDate(date.getUTCDate() + interval);
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + interval * 7);
  if (frequency === "monthly") {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + interval);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  const next = date.toISOString().slice(0, 10);
  return skipWeekends ? moveToWeekday(next) : next;
}

export function recurringOccurrence(startDate: string, dueOffsetDays: number, skipWeekends: boolean) {
  const occurrenceDate = skipWeekends ? moveToWeekday(startDate) : startDate;
  const rawDueDate = addDateDays(occurrenceDate, dueOffsetDays);
  return {
    occurrenceDate,
    dueDate: skipWeekends ? moveToWeekday(rawDueDate) : rawDueDate,
  };
}
