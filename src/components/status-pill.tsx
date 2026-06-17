import { formatLabel } from "@/lib/utils";
import { taskPriorityTone, taskStatusTone } from "@/lib/task-tones";

const tones: Record<string, string> = {
  ...taskStatusTone,
  ...taskPriorityTone,
  draft: "border-zinc-300 bg-zinc-50 text-zinc-600",
  active: "border-emerald-300 bg-emerald-50 text-emerald-700",
  paused: "border-amber-300 bg-amber-50 text-amber-700",
  archived: "border-zinc-300 bg-zinc-100 text-zinc-500",
  assigned: "border-blue-300 bg-blue-50 text-blue-700",
  approved: "border-emerald-400 bg-emerald-50 text-emerald-700",
  launched: "border-emerald-400 bg-emerald-50 text-emerald-700",
  stopped: "border-zinc-400 bg-zinc-100 text-zinc-600",
};

export function StatusPill({ value }: { value: string }) {
  return (
    <span className={`inline-flex border bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${tones[value] ?? tones.normal}`}>
      {formatLabel(value)}
    </span>
  );
}
