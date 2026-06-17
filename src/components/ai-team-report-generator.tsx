"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateAiTeamReport } from "@/actions/team-reports";

export function AiTeamReportGenerator() {
  const router = useRouter();
  const [period, setPeriod] = useState<"last_week" | "this_week" | "last_30_days">("last_week");
  const [focus, setFocus] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function generate() {
    setError("");
    startTransition(async () => {
      try {
        const result = await generateAiTeamReport({ period, focus });
        router.push(`/team?report=${result.reportId}#ai-report`);
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not generate report.");
      }
    });
  }

  return (
    <div className="border-y border-zinc-950 bg-white py-4">
      <div className="grid gap-3 lg:grid-cols-[180px_1fr_auto] lg:items-end">
        <label className="text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Period
          <select
            value={period}
            disabled={pending}
            onChange={(event) => setPeriod(event.currentTarget.value as typeof period)}
            className="mt-1.5 w-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 disabled:opacity-50"
          >
            <option value="last_week">Last week</option>
            <option value="this_week">This week</option>
            <option value="last_30_days">Last 30 days</option>
          </select>
        </label>
        <label className="text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          Optional focus
          <input
            value={focus}
            disabled={pending}
            maxLength={1000}
            onChange={(event) => setFocus(event.currentTarget.value)}
            placeholder="Example: Focus on client risks and overloaded teammates"
            className="mt-1.5 w-full border border-zinc-200 px-3 py-2 text-xs font-normal normal-case tracking-normal text-zinc-700 disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={generate}
          className="ui-action ui-action-primary flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Sparkles className="size-3.5" />{pending ? "Generating..." : "Generate AI report"}
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
