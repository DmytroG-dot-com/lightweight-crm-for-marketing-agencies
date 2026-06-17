import { createTask, updateTask } from "@/actions/crm";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { formatLabel } from "@/lib/utils";

type List = { id: string; name: string; kind?: string };
type Member = { user_id: string; display_name: string | null; email: string | null };
type TaskOption = { id: string; title: string };
type TaskDefaults = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  task_list_id: string | null;
  parent_task_id: string | null;
  start_date: string | null;
  due_date: string | null;
};

export function TaskForm({
  clientId,
  lists,
  members,
  tasks,
  defaults,
  preferredListId,
}: {
  clientId: string;
  lists: List[];
  members: Member[];
  tasks: TaskOption[];
  defaults?: TaskDefaults;
  preferredListId?: string;
}) {
  const action = defaults ? updateTask : createTask;
  const defaultListId = defaults?.task_list_id ?? preferredListId ?? lists.find((list) => list.kind === "general")?.id ?? lists[0]?.id;
  return (
    <form action={action} className="grid gap-x-5 gap-y-6 border-y bg-white py-6 lg:grid-cols-4">
      <input type="hidden" name="client_id" value={clientId} />
      {defaults && <input type="hidden" name="task_id" value={defaults.id} />}
      <label className="text-sm font-medium lg:col-span-2">
        Title
        <input
          name="title"
          required
          defaultValue={defaults?.title}
          className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="Prepare campaign brief"
        />
      </label>
      <label className="text-sm font-medium">
        Status
        <select name="status" defaultValue={defaults?.status ?? "todo"} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
          {TASK_STATUSES.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">
        Priority
        <select name="priority" defaultValue={defaults?.priority ?? "normal"} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
          {TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{formatLabel(priority)}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium lg:col-span-2">
        Description
        <textarea name="description" defaultValue={defaults?.description ?? ""} rows={3} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
      </label>
      <label className="text-sm font-medium">
        Assignee
        <select name="assignee_id" defaultValue={defaults?.assignee_id ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.display_name || member.email || "Member"}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        List
        <select name="task_list_id" required defaultValue={defaultListId} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
          {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">
        Start date
        <input name="start_date" type="date" defaultValue={defaults?.start_date ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
      </label>
      <label className="text-sm font-medium">
        Due date
        <input name="due_date" type="date" defaultValue={defaults?.due_date ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
      </label>
      <label className="text-sm font-medium lg:col-span-2">
        Parent task
        <select name="parent_task_id" defaultValue={defaults?.parent_task_id ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
          <option value="">No parent</option>
          {tasks.filter((task) => task.id !== defaults?.id).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select>
      </label>
      <div className="flex items-end lg:col-span-4">
        <button className="ui-action ui-action-primary">
          {defaults ? "Save task" : "Create task"}
        </button>
      </div>
    </form>
  );
}
