"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createSubtask } from "@/actions/crm";
import { TaskDateRangePicker } from "@/components/task-date-range-picker";

export function SubtaskComposer({
  clientId,
  parentTaskId,
  members,
  defaultAssigneeId,
  defaultStartDate,
  defaultDueDate,
}: {
  clientId: string;
  parentTaskId: string;
  members: Array<{ user_id: string; display_name: string | null; email: string | null }>;
  defaultAssigneeId: string | null;
  defaultStartDate: string | null;
  defaultDueDate: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [dates, setDates] = useState({
    start: defaultStartDate ?? "",
    due: defaultDueDate ?? "",
  });
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function submit(formData: FormData) {
    formData.set("client_id", clientId);
    formData.set("parent_task_id", parentTaskId);
    formData.set("start_date", dates.start);
    formData.set("due_date", dates.due);
    setMessage("");
    startTransition(async () => {
      try {
        await createSubtask(formData);
        formRef.current?.reset();
        setMessage("Subtask created");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not create subtask.");
      }
    });
  }

  return (
    <form ref={formRef} action={submit} className="grid gap-2 border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-[minmax(0,1fr)_150px] lg:grid-cols-[minmax(0,1fr)_150px_minmax(250px,1fr)_auto]">
      <input name="title" required placeholder="Add a subtask..." className="border border-zinc-300 bg-white px-3 py-2 text-xs" />
      <select name="assignee_id" defaultValue={defaultAssigneeId ?? ""} className="border border-zinc-300 bg-white px-2 py-2 text-xs">
        <option value="">Unassigned</option>
        {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.email || "Member"}</option>)}
      </select>
      <div className="sm:col-span-2 lg:col-span-1">
        <TaskDateRangePicker
          startDate={dates.start}
          dueDate={dates.due}
          disabled={pending}
          onChange={(start, due) => setDates({ start, due })}
        />
      </div>
      <button disabled={pending} className="ui-action ui-action-primary flex items-center justify-center gap-1.5 disabled:opacity-50">
        <Plus className="size-3.5" />Add
      </button>
      {message && <p className={`text-[10px] sm:col-span-2 lg:col-span-4 ${message === "Subtask created" ? "text-emerald-600" : "text-red-600"}`}>{message}</p>}
    </form>
  );
}
