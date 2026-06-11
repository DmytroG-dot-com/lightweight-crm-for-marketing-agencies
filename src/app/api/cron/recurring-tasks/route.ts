import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateInputValue } from "@/lib/utils";

function advanceDate(value: string, frequency: string, interval: number) {
  const date = new Date(`${value}T12:00:00Z`);
  if (frequency === "daily") date.setUTCDate(date.getUTCDate() + interval);
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + interval * 7);
  if (frequency === "monthly") date.setUTCMonth(date.getUTCMonth() + interval);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = dateInputValue();
  const { data: rules, error } = await admin
    .from("recurring_task_rules")
    .select("*")
    .eq("active", true)
    .lte("next_run_at", today)
    .order("next_run_at")
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let generated = 0;
  const failures: string[] = [];
  for (const rule of rules ?? []) {
    const { error: insertError } = await admin.from("tasks").upsert(
      {
        agency_id: rule.agency_id,
        client_id: rule.client_id,
        task_list_id: rule.task_list_id,
        source_recurring_rule_id: rule.id,
        occurrence_date: rule.next_run_at,
        title: rule.title,
        description: rule.description,
        status: "todo",
        priority: rule.priority,
        assignee_id: rule.assignee_id,
        start_date: rule.next_run_at,
        due_date: rule.next_run_at,
        created_by: rule.created_by,
      },
      { onConflict: "source_recurring_rule_id,occurrence_date", ignoreDuplicates: true },
    );
    if (insertError) {
      failures.push(`${rule.id}: ${insertError.message}`);
      continue;
    }

    const nextRun = advanceDate(rule.next_run_at, rule.frequency, rule.interval_count);
    const { error: updateError } = await admin.from("recurring_task_rules").update({ next_run_at: nextRun }).eq("id", rule.id);
    if (updateError) {
      failures.push(`${rule.id}: ${updateError.message}`);
      continue;
    }
    generated += 1;
    await logActivity(admin, {
      agencyId: rule.agency_id,
      actorId: rule.created_by,
      clientId: rule.client_id,
      action: "recurring_task.generated",
      entityType: "recurring_task_rule",
      entityId: rule.id,
      metadata: { occurrence_date: rule.next_run_at },
    });
  }

  return NextResponse.json({ processed: rules?.length ?? 0, generated, failures });
}
