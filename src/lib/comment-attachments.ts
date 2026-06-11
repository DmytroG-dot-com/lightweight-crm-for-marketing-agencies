import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type Attachment = {
  storage_path: string;
  signed_url?: string;
};

type Comment = {
  task_comment_attachments?: Attachment[];
};

type TaskWithComments = {
  task_comments?: Comment[];
};

export async function signTaskAttachments<T extends TaskWithComments>(tasks: T[]) {
  const attachments = tasks.flatMap((task) =>
    (task.task_comments ?? []).flatMap((comment) => comment.task_comment_attachments ?? []),
  );
  const paths = attachments.map((attachment) => attachment.storage_path);
  if (!paths.length) return tasks;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("comment-attachments")
    .createSignedUrls(paths, 60 * 60);
  if (error) {
    console.error("Unable to sign comment attachments:", error.message);
    return tasks;
  }

  const urls = new Map(data.map((item) => [item.path, item.signedUrl]));
  attachments.forEach((attachment) => {
    attachment.signed_url = urls.get(attachment.storage_path) ?? undefined;
  });
  return tasks;
}
