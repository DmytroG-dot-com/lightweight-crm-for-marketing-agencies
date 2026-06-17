import { redirect } from "next/navigation";
import { requireAgency } from "@/lib/auth";

type RouteTask = {
  id: string;
  client_id: string;
  task_list_id: string | null;
};

export default async function TaskShareRedirectPage({
  params,
}: {
  params: Promise<{ shareCode: string }>;
}) {
  const { shareCode } = await params;
  const context = await requireAgency();
  const { data: task, error: taskError } = await context.supabase
    .from("tasks")
    .select("id, client_id, task_list_id")
    .eq("agency_id", context.agency.id)
    .eq("share_code", shareCode)
    .is("archived_at", null)
    .maybeSingle();

  if (taskError) throw new Error(taskError.message);
  if (!task) redirect("/clients");

  const resolvedTask = task as RouteTask;
  let listParam = resolvedTask.task_list_id ?? "general";

  if (resolvedTask.task_list_id) {
    const { data: taskList, error: taskListError } = await context.supabase
      .from("task_lists")
      .select("kind")
      .eq("agency_id", context.agency.id)
      .eq("id", resolvedTask.task_list_id)
      .maybeSingle();

    if (taskListError) throw new Error(taskListError.message);
    if (taskList?.kind === "general" || taskList?.kind === "recurring") listParam = taskList.kind;
  }

  redirect(`/clients/${resolvedTask.client_id}?tab=tasks&list=${listParam}&task=${resolvedTask.id}`);
}
