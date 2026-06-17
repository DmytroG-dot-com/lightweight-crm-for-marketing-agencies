import Link from "next/link";
import { CheckCheck } from "lucide-react";
import { markAllNotificationsRead } from "@/actions/inbox";
import { EmptyState } from "@/components/empty-state";
import {
  InboxNotificationBoard,
  type InboxNotification,
  type InboxNotificationMetadata,
} from "@/components/inbox-notification-board";
import { PageHeader } from "@/components/page-header";
import { requireAgency } from "@/lib/auth";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const context = await requireAgency();
  const { tab } = await searchParams;
  const activeTab = tab === "cleared" ? "cleared" : "inbox";
  let query = context.supabase
    .from("notifications")
    .select("id, actor_id, client_id, task_id, kind, title, body, metadata, read_at, cleared_at, created_at, clients!inner(status)")
    .eq("agency_id", context.agency.id)
    .eq("recipient_id", context.user.id)
    .neq("clients.status", "archived");

  query = activeTab === "cleared"
    ? query.not("cleared_at", "is", null)
    : query.is("cleared_at", null);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const notifications: InboxNotification[] = (data ?? []).map((notification) => ({
    id: notification.id,
    actor_id: notification.actor_id,
    client_id: notification.client_id,
    task_id: notification.task_id,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    metadata: ((notification.metadata ?? {}) as InboxNotificationMetadata),
    read_at: notification.read_at,
    cleared_at: notification.cleared_at,
    created_at: notification.created_at,
  }));
  const clientIds = [...new Set(notifications.map((notification) => notification.client_id))];
  const taskIds = [...new Set(notifications.map((notification) => notification.task_id))];
  const actorIds = [...new Set(notifications.map((notification) => notification.actor_id).filter((id): id is string => !!id))];
  const [
    { data: clients, error: clientsError },
    { data: tasks, error: tasksError },
    { data: actors, error: actorsError },
  ] = await Promise.all([
    clientIds.length
      ? context.supabase.from("clients").select("id, name").eq("agency_id", context.agency.id).in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length
      ? context.supabase.from("tasks").select("id, title").eq("agency_id", context.agency.id).in("id", taskIds)
      : Promise.resolve({ data: [], error: null }),
    actorIds.length
      ? context.supabase.from("agency_members").select("user_id, display_name, email").eq("agency_id", context.agency.id).in("user_id", actorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const relatedDataError = clientsError || tasksError || actorsError;
  if (relatedDataError) throw new Error(relatedDataError.message);
  const clientNames = Object.fromEntries((clients ?? []).map((client) => [client.id, client.name]));
  const taskNames = Object.fromEntries((tasks ?? []).map((task) => [task.id, task.title]));
  const actorNames = Object.fromEntries((actors ?? []).map((actor) => [actor.user_id, actor.display_name || actor.email || "Teammate"]));
  const unread = notifications.filter((notification) => !notification.read_at);
  const boardKey = `${activeTab}:${notifications.map((notification) => (
    `${notification.id}:${notification.read_at ?? "unread"}:${notification.cleared_at ?? "open"}`
  )).join("|")}`;

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Task comments, mentions, and status updates that need your attention."
        actions={activeTab === "inbox" && unread.length > 0 ? (
          <form action={markAllNotificationsRead}>
            <button className="ui-action flex items-center gap-2"><CheckCheck className="size-3.5" />Mark all read</button>
          </form>
        ) : undefined}
      />
      <nav className="mb-10 flex gap-6 border-b border-zinc-300" aria-label="Inbox view">
        <InboxTab href="/inbox" active={activeTab === "inbox"}>Inbox</InboxTab>
        <InboxTab href="/inbox?tab=cleared" active={activeTab === "cleared"}>Cleared</InboxTab>
      </nav>

      {!notifications.length ? (
        activeTab === "inbox"
          ? <EmptyState title="Inbox clear" description="Watch a task or get mentioned in a comment to receive updates here." />
          : <EmptyState title="No cleared notifications" description="Cleared notifications will stay here for reference." />
      ) : (
        <InboxNotificationBoard
          key={boardKey}
          activeTab={activeTab}
          notifications={notifications}
          clientNames={clientNames}
          taskNames={taskNames}
          actorNames={actorNames}
          timezone={context.membership.timezone}
        />
      )}
    </>
  );
}

function InboxTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`border-b-2 px-1 pb-3 text-xs font-semibold uppercase tracking-[0.1em] ${
        active ? "border-blue-600 text-blue-700" : "border-transparent text-zinc-400 hover:text-zinc-700"
      }`}
    >
      {children}
    </Link>
  );
}
