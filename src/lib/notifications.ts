import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatLabel } from "@/lib/utils";

type Member = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

type NotificationInput = {
  supabase: SupabaseClient;
  agencyId: string;
  actorId: string;
  actorName: string;
  clientId: string;
  taskId: string;
  taskTitle: string;
  kind: "comment_added" | "status_changed";
  body?: string | null;
  commentId?: string | null;
  mentionedMemberIds?: string[];
  metadata?: Record<string, unknown>;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMentionedMemberIds(body: string, members: Member[]) {
  if (!body.includes("@")) return [];
  return members
    .filter((member) => {
      const label = member.display_name?.trim() || member.email?.trim();
      if (!label) return false;
      const mention = new RegExp(`(^|[\\s(])@${escapeRegExp(label)}(?=$|[\\s.,!?;:)])`, "iu");
      return mention.test(body);
    })
    .map((member) => member.user_id);
}

export async function ensureTaskWatchers({
  agencyId,
  taskId,
  userIds,
}: {
  agencyId: string;
  taskId: string;
  userIds: string[];
}) {
  const uniqueUserIds = [...new Set(userIds)];
  if (!uniqueUserIds.length) return;

  const admin = createAdminClient();
  // Service-role writes are limited to users verified as members of this agency.
  const { data: members, error: memberError } = await admin
    .from("agency_members")
    .select("user_id")
    .eq("agency_id", agencyId)
    .in("user_id", uniqueUserIds);
  if (memberError) throw new Error(memberError.message);
  if (!members?.length) return;

  const { error } = await admin.from("task_watchers").upsert(
    members.map((member) => ({
      agency_id: agencyId,
      task_id: taskId,
      user_id: member.user_id,
    })),
    { onConflict: "task_id,user_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

export async function notifyTaskAudience({
  supabase,
  agencyId,
  actorId,
  actorName,
  clientId,
  taskId,
  taskTitle,
  kind,
  body,
  commentId,
  mentionedMemberIds = [],
  metadata = {},
}: NotificationInput) {
  const { data: watchers, error: watcherError } = await supabase
    .from("task_watchers")
    .select("user_id")
    .eq("agency_id", agencyId)
    .eq("task_id", taskId);
  if (watcherError) {
    console.error("Unable to load task watchers:", watcherError.message);
    return;
  }

  const mentioned = new Set(mentionedMemberIds.filter((userId) => userId !== actorId));
  const recipients = new Set(
    (watchers ?? []).map((watcher) => watcher.user_id).filter((userId) => userId !== actorId),
  );
  mentioned.forEach((userId) => recipients.add(userId));
  if (!recipients.size) return;

  const messageBody = body?.trim() || null;
  const rows = [...recipients].map((recipientId) => {
    const isMention = mentioned.has(recipientId);
    const fromStatus = typeof metadata.from_status === "string" ? metadata.from_status : null;
    const toStatus = typeof metadata.to_status === "string" ? metadata.to_status : null;
    const statusTransitionTitle = fromStatus && toStatus
      ? `${actorName} changed status ${formatLabel(fromStatus)} → ${formatLabel(toStatus)}`
      : `${actorName} changed the status of ${taskTitle}`;
    return {
      agency_id: agencyId,
      recipient_id: recipientId,
      actor_id: actorId,
      client_id: clientId,
      task_id: taskId,
      comment_id: commentId ?? null,
      kind: isMention ? "mention" : kind,
      title: isMention
        ? `${actorName} mentioned you in ${taskTitle}`
        : kind === "status_changed"
          ? statusTransitionTitle
          : `${actorName} commented on ${taskTitle}`,
      body: messageBody,
      metadata: {
        ...metadata,
        event_kind: isMention ? "mention" : kind,
        task_title: taskTitle,
      },
    };
  });
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) console.error("Unable to create inbox notifications:", error.message);
}
