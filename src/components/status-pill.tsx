import { formatLabel } from "@/lib/utils";

const tones: Record<string, string> = {
  todo: "bg-zinc-100 text-zinc-700",
  draft: "bg-zinc-100 text-zinc-700",
  assigned: "bg-blue-50 text-blue-700",
  in_progress: "bg-blue-50 text-blue-700",
  ready: "bg-indigo-50 text-indigo-700",
  review: "bg-amber-50 text-amber-700",
  blocked: "bg-red-50 text-red-700",
  complete: "bg-emerald-50 text-emerald-700",
  approved: "bg-emerald-50 text-emerald-700",
  launched: "bg-emerald-50 text-emerald-700",
  stopped: "bg-zinc-200 text-zinc-700",
  urgent: "bg-red-50 text-red-700",
  high: "bg-orange-50 text-orange-700",
  normal: "bg-zinc-100 text-zinc-700",
  low: "bg-slate-50 text-slate-600",
};

export function StatusPill({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tones[value] ?? tones.normal}`}>
      {formatLabel(value)}
    </span>
  );
}
