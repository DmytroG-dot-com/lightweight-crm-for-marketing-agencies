import { NextResponse, type NextRequest } from "next/server";
import { logActivity } from "@/lib/activity";
import { ensureTaskWatchers } from "@/lib/notifications";
import { advanceRecurringDate, recurringOccurrence } from "@/lib/recurrence";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeNullableTaskDescription } from "@/lib/task-description";
import { dateInputValue } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = dateInputValue();
  const { data: activeClients, error: clientsError } = await admin
    .from("clients")
    .select("id")
    .eq("status", "active");
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });
  if (!activeClients?.length) {
    return NextResponse.json({ processed: 0, generated: 0, failures: [] });
  }

  const { data: rules, error } = await admin
    .from("recurring_task_rules")
    .select("*")
    .in("client_id", activeClients.map((client) => client.id))
    .eq("active", true)
    .lte("next_run_at", today)
    .order("next_run_at")
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let generated = 0;
  const failures: string[] = [];
  for (const rule of rules ?? []) {
    const { occurrenceDate, dueDate } = recurringOccurrence(rule.next_run_at, rule.due_offset_days ?? 0, rule.skip_weekends ?? false);
    if (occurrenceDate > today) {
      const { error: deferError } = await admin.from("recurring_task_rules").update({ next_run_at: occurrenceDate }).eq("id", rule.id);
      if (deferError) failures.push(`${rule.id}: ${deferError.message}`);
      continue;
    }
    const { data: task, error: insertError } = await admin
      .from("tasks")
      .upsert(
        {
          agency_id: rule.agency_id,
          client_id: rule.client_id,
          task_list_id: rule.task_list_id,
          source_recurring_rule_id: rule.id,
          occurrence_date: occurrenceDate,
          title: rule.title,
          description: normalizeNullableTaskDescription(rule.description),
          status: "todo",
          priority: rule.priority,
          assignee_id: rule.assignee_id,
          start_date: occurrenceDate,
          due_date: dueDate,
          created_by: rule.created_by,
        },
        { onConflict: "source_recurring_rule_id,occurrence_date", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (insertError) {
      failures.push(`${rule.id}: ${insertError.message}`);
      continue;
    }
    if (task && rule.created_by) {
      await ensureTaskWatchers({
        agencyId: rule.agency_id,
        taskId: task.id,
        userIds: [rule.created_by],
      });
    }

    const nextRun = advanceRecurringDate(occurrenceDate, rule.frequency, rule.interval_count, rule.skip_weekends ?? false);
    const { error: updateError } = await admin.from("recurring_task_rules").update({ next_run_at: nextRun }).eq("id", rule.id);
    if (updateError) {
      failures.push(`${rule.id}: ${updateError.message}`);
      continue;
    }
    if (task) generated += 1;
    await logActivity(admin, {
      agencyId: rule.agency_id,
      actorId: rule.created_by,
      clientId: rule.client_id,
      action: "recurring_task.generated",
      entityType: "recurring_task_rule",
      entityId: rule.id,
      metadata: { occurrence_date: occurrenceDate, due_date: dueDate },
    });
  }

  return NextResponse.json({ processed: rules?.length ?? 0, generated, failures });
}
