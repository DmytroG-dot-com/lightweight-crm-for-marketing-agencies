import { CommentComposer } from "@/components/comment-composer";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import { TaskForm } from "@/components/task-form";
import { TaskDueDateInput, TaskStatusSelect } from "@/components/task-inline-controls";
import { TaskLifecycleActions } from "@/components/task-lifecycle-actions";

export type Member = { user_id: string; display_name: string | null; email: string | null };
export type List = { id: string; name: string; kind?: string; client_id?: string };
type Attachment = {
  id: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number;
  storage_path: string;
  signed_url?: string;
};
type Comment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  task_comment_attachments?: Attachment[];
};
export type Task = {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  task_list_id: string | null;
  parent_task_id: string | null;
  start_date: string | null;
  due_date: string | null;
  task_comments?: Comment[];
  clients?: { name: string } | null;
};

export function TaskTable({
  tasks,
  lists,
  members,
  agencyId,
  showClient = false,
}: {
  tasks: Task[];
  lists: List[];
  members: Member[];
  agencyId: string;
  showClient?: boolean;
}) {
  if (!tasks.length) return <EmptyState title="No tasks found" description="Create a task or adjust the current filters." />;
  const memberNames = new Map(members.map((member) => [member.user_id, member.display_name || member.email || "Member"]));
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Task</th>
              {showClient && <th className="px-4 py-3 font-medium">Client</th>}
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Assignee</th>
              <th className="px-4 py-3 font-medium">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tasks.map((task) => (
              <tr key={task.id} className="align-top">
                <td className="px-4 py-3">
                  <details>
                    <summary className="cursor-pointer list-none font-medium text-zinc-950 hover:underline">{task.title}</summary>
                    <div className="mt-4 w-[760px] max-w-[75vw] space-y-4">
                      <TaskForm
                        clientId={task.client_id}
                        lists={lists.filter((list) => !list.client_id || list.client_id === task.client_id)}
                        members={members}
                        tasks={tasks.filter((candidate) => candidate.client_id === task.client_id).map(({ id, title }) => ({ id, title }))}
                        defaults={task}
                      />
                      <div className="rounded-xl border bg-zinc-50 p-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Comments</p>
                        <div className="space-y-2">
                          {(task.task_comments ?? []).map((comment) => (
                            <div key={comment.id} className="rounded-lg bg-white px-3 py-2 text-sm">
                              {comment.body && <p className="whitespace-pre-wrap">{comment.body}</p>}
                              {!!comment.task_comment_attachments?.length && (
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  {comment.task_comment_attachments.map((attachment) => (
                                    <AttachmentPreview key={attachment.id} attachment={attachment} />
                                  ))}
                                </div>
                              )}
                              <p className="mt-1 text-xs text-zinc-400">
                                {comment.author_id ? memberNames.get(comment.author_id) ?? "Member" : "Former member"} · {new Date(comment.created_at).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                        <CommentComposer agencyId={agencyId} clientId={task.client_id} taskId={task.id} />
                      </div>
                      <TaskLifecycleActions clientId={task.client_id} taskId={task.id} />
                    </div>
                  </details>
                </td>
                {showClient && <td className="px-4 py-3 text-zinc-600">{task.clients?.name ?? "—"}</td>}
                <td className="px-4 py-3">
                  <TaskStatusSelect clientId={task.client_id} taskId={task.id} status={task.status} />
                </td>
                <td className="px-4 py-3"><StatusPill value={task.priority} /></td>
                <td className="px-4 py-3 text-zinc-600">{task.assignee_id ? memberNames.get(task.assignee_id) ?? "Member" : "Unassigned"}</td>
                <td className="px-4 py-3 text-zinc-600"><TaskDueDateInput clientId={task.client_id} taskId={task.id} dueDate={task.due_date} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  if (!attachment.signed_url) return <span className="text-xs text-zinc-500">{attachment.file_name}</span>;
  if (attachment.content_type?.startsWith("image/")) {
    return (
      <a href={attachment.signed_url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border bg-zinc-50">
        {/* Signed URLs are short-lived and can safely render directly from Supabase Storage. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.signed_url} alt={attachment.file_name} className="max-h-56 w-full object-contain" />
        <span className="block truncate px-2 py-1 text-xs">{attachment.file_name}</span>
      </a>
    );
  }
  if (attachment.content_type?.startsWith("video/")) {
    return (
      <div className="rounded-lg border bg-zinc-50 p-2">
        <video src={attachment.signed_url} controls className="max-h-64 w-full rounded" />
        <a href={attachment.signed_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs underline">{attachment.file_name}</a>
      </div>
    );
  }
  return <a href={attachment.signed_url} target="_blank" rel="noreferrer" className="rounded-lg border bg-zinc-50 px-3 py-2 text-xs font-medium underline">{attachment.file_name}</a>;
}
