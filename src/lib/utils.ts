export function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const DEFAULT_TIMEZONE = "America/New_York";

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function formatDateTime(value: string | Date, timeZone = "UTC") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateInputValue(date = new Date(), timeZone?: string) {
  if (!timeZone || !isValidTimeZone(timeZone)) return date.toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function addDaysToDateValue(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function creativeDateTone(dateValue: string, status: string, timeZone?: string) {
  if (status === "launched" || status === "stopped") return "";
  const today = dateInputValue(new Date(), timeZone);
  const tomorrow = addDaysToDateValue(today, 1);
  if (dateValue <= today) return "bg-red-50 text-red-700 ring-red-200";
  if (dateValue === tomorrow) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "";
}

export function generateAdNames(hypothesis: string, count: number) {
  const ignored = new Set(["that", "with", "from", "this", "your", "will", "into", "when", "then", "than"]);
  const keyword = hypothesis
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !ignored.has(word))
    .slice(0, 3)
    .join("-");
  const base = keyword || "creative";
  return Array.from({ length: Math.max(1, count) }, (_, index) => `${base}-${String(index + 1).padStart(2, "0")}`);
}
