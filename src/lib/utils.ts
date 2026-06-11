export function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function dateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function creativeDateTone(dateValue: string, status: string) {
  if (status === "launched" || status === "stopped") return "";
  const today = dateInputValue();
  const tomorrow = dateInputValue(addDays(new Date(), 1));
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
