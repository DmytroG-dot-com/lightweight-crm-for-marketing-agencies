"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { getAgencyAiRuntimeSettings } from "@/lib/ai/settings";
import { generateTeamReportWithAi, type AiTeamReport } from "@/lib/ai/team-report";
import { requireAgencyAdmin } from "@/lib/auth";

const requestSchema = z.object({
  period: z.enum(["last_week", "this_week", "last_30_days"]),
  focus: z.string().trim().max(1000).optional().default(""),
});

export async function generateAiTeamReport(input: unknown) {
  const parsed = requestSchema.parse(input);
  const context = await requireAgencyAdmin();
  const settings = await getAgencyAiRuntimeSettings(context.agency.id);
  if (!settings) throw new Error("Enable and configure AI in Settings before generating reports.");
  const { start, end } = reportPeriod(parsed.period);

  const [
    { data: metrics, error: metricsError },
    { data: completed, error: completedError },
    { data: risks, error: risksError },
  ] = await Promise.all([
    context.supabase.rpc("get_team_report_metrics", {
      target_agency_id: context.agency.id,
      range_start: start.toISOString(),
      range_end: end.toISOString(),
    }),
    context.supabase
      .from("tasks")
      .select("id, title, client_id, completed_at, completed_assignee_id, clients!inner(name, status)")
      .eq("agency_id", context.agency.id)
      .eq("status", "complete")
      .neq("clients.status", "archived")
      .is("archived_at", null)
      .gte("completed_at", start.toISOString())
      .lt("completed_at", end.toISOString())
      .order("completed_at", { ascending: false })
      .limit(120),
    context.supabase
      .from("tasks")
      .select("id, title, client_id, status, priority, assignee_id, due_date, clients!inner(name, status)")
      .eq("agency_id", context.agency.id)
      .neq("clients.status", "archived")
      .is("archived_at", null)
      .neq("status", "complete")
      .or(`status.eq.blocked,due_date.lt.${new Date().toISOString().slice(0, 10)}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(120),
  ]);
  const queryError = metricsError || completedError || risksError;
  if (queryError) throw new Error(queryError.message);

  const metricClientIds = ((metrics as { clients?: Array<{ id: string }> } | null)?.clients ?? []).map((client) => client.id);
  const report = validateEvidence(await generateTeamReportWithAi({
    settings,
    context: {
      period: {
        key: parsed.period,
        start: start.toISOString(),
        end: end.toISOString(),
      },
      metric_definitions: {
        open_tasks: "Current snapshot at report generation time.",
        overdue_tasks: "Current snapshot at report generation time.",
        completed_tasks: "Completed within the selected reporting period.",
        comments_added: "Added within the selected reporting period.",
        activity_count: "Logged within the selected reporting period.",
      },
      focus: parsed.focus || null,
      metrics,
      completed_tasks: completed ?? [],
      overdue_or_blocked_tasks: risks ?? [],
    },
  }), completed ?? [], risks ?? [], metricClientIds);

  const { data: saved, error } = await context.supabase
    .from("ai_team_reports")
    .insert({
      agency_id: context.agency.id,
      period_key: parsed.period,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      focus: parsed.focus || null,
      report,
      model: settings.model,
      generated_by: context.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(context.supabase, {
    agencyId: context.agency.id,
    actorId: context.user.id,
    action: "ai.team_report_generated",
    entityType: "ai_team_report",
    entityId: saved.id,
    metadata: { period: parsed.period, model: settings.model },
  });
  revalidatePath("/team");
  return { reportId: saved.id };
}

function validateEvidence(
  report: AiTeamReport,
  completed: Array<{ id: string; client_id: string }>,
  risks: Array<{ id: string; client_id: string }>,
  metricClientIds: string[],
) {
  const taskIds = new Set([...completed, ...risks].map((task) => task.id));
  const clientIds = new Set([...completed, ...risks].map((task) => task.client_id).concat(metricClientIds));
  const cleanItems = (items: AiTeamReport["wins"]) => items.map((item) => ({
    ...item,
    task_ids: item.task_ids.filter((id) => taskIds.has(id)),
    client_ids: item.client_ids.filter((id) => clientIds.has(id)),
  }));
  return {
    ...report,
    wins: cleanItems(report.wins),
    risks: cleanItems(report.risks),
    recommendations: cleanItems(report.recommendations),
  };
}

function reportPeriod(period: z.infer<typeof requestSchema>["period"]) {
  const now = new Date();
  const thisWeek = startOfUtcWeek(now);
  if (period === "last_week") {
    const start = new Date(thisWeek);
    start.setUTCDate(start.getUTCDate() - 7);
    return { start, end: thisWeek };
  }
  if (period === "this_week") return { start: thisWeek, end: now };
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 30);
  return { start, end: now };
}

function startOfUtcWeek(date: Date) {
  const start = new Date(date);
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
  start.setUTCHours(0, 0, 0, 0);
  return start;
}
