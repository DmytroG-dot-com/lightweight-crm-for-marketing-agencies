"use client";

import type { ComponentProps } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Bell, Eye, MailOpen, MessageSquareText, RefreshCw, RotateCcw, X } from "lucide-react";
import {
  clearNotification,
  openNotification,
  restoreNotification,
  setNotificationReadState,
} from "@/actions/inbox";
import { EmptyState } from "@/components/empty-state";
import { TASK_STATUSES } from "@/lib/constants";
import { taskStatusTone } from "@/lib/task-tones";
import { formatDateTime, formatLabel } from "@/lib/utils";

type TaskStatus = (typeof TASK_STATUSES)[number];

export type InboxNotificationMetadata = {
  from_status?: string;
  to_status?: string;
  event_kind?: string;
  task_title?: string;
};

export type InboxNotification = {
  id: string;
  actor_id: string | null;
  client_id: string;
  task_id: string;
  kind: "mention" | "comment_added" | "status_changed";
  title: string;
  body: string | null;
  metadata: InboxNotificationMetadata;
  read_at: string | null;
  cleared_at: string | null;
  created_at: string;
};

type NotificationTone = {
  tile: string;
  unreadRow: string;
  unreadBadge: string;
  changeSurface: string;
  arrow: string;
};

const defaultTone: NotificationTone = {
  tile: "border-blue-200 bg-blue-50 text-blue-700",
  unreadRow: "border-l-2 border-blue-600 bg-blue-50/35",
  unreadBadge: "border-blue-200 bg-blue-50 text-blue-700",
  changeSurface: "border-blue-200 bg-blue-50/60 text-blue-700",
  arrow: "text-blue-500",
};

const statusNotificationTone: Record<TaskStatus, NotificationTone> = {
  todo: {
    tile: "border-zinc-300 bg-zinc-100 text-zinc-700",
    unreadRow: "border-l-2 border-zinc-500 bg-zinc-100/70",
    unreadBadge: "border-zinc-300 bg-zinc-100 text-zinc-700",
    changeSurface: "border-zinc-300 bg-zinc-100/80 text-zinc-700",
    arrow: "text-zinc-400",
  },
  in_progress: {
    tile: "border-blue-200 bg-blue-50 text-blue-700",
    unreadRow: "border-l-2 border-blue-600 bg-blue-50/35",
    unreadBadge: "border-blue-200 bg-blue-50 text-blue-700",
    changeSurface: "border-blue-200 bg-blue-50/70 text-blue-700",
    arrow: "text-blue-500",
  },
  review: {
    tile: "border-amber-200 bg-amber-50 text-amber-800",
    unreadRow: "border-l-2 border-amber-500 bg-amber-50/45",
    unreadBadge: "border-amber-200 bg-amber-50 text-amber-800",
    changeSurface: "border-amber-200 bg-amber-50/80 text-amber-800",
    arrow: "text-amber-500",
  },
  blocked: {
    tile: "border-red-200 bg-red-50 text-red-700",
    unreadRow: "border-l-2 border-red-500 bg-red-50/45",
    unreadBadge: "border-red-200 bg-red-50 text-red-700",
    changeSurface: "border-red-200 bg-red-50/80 text-red-700",
    arrow: "text-red-500",
  },
  complete: {
    tile: "border-emerald-200 bg-emerald-50 text-emerald-700",
    unreadRow: "border-l-2 border-emerald-500 bg-emerald-50/45",
    unreadBadge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    changeSurface: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
    arrow: "text-emerald-500",
  },
};

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && TASK_STATUSES.includes(value as TaskStatus);
}

function normalizeTaskStatus(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll(/[\s-]+/g, "_");
  return isTaskStatus(normalized) ? normalized : null;
}

function getStatusTransition(notification: InboxNotification) {
  if (notification.kind !== "status_changed") return null;

  const metadataFrom = isTaskStatus(notification.metadata.from_status) ? notification.metadata.from_status : null;
  const metadataTo = isTaskStatus(notification.metadata.to_status) ? notification.metadata.to_status : null;
  if (metadataFrom && metadataTo) {
    return { fromStatus: metadataFrom, toStatus: metadataTo };
  }

  const bodyMatch = notification.body?.match(/status changed from ([a-z_\s-]+) to ([a-z_\s-]+)\.?$/i);
  if (!bodyMatch) return null;

  const parsedFrom = normalizeTaskStatus(bodyMatch[1]);
  const parsedTo = normalizeTaskStatus(bodyMatch[2]);
  if (!parsedFrom || !parsedTo) return null;

  return { fromStatus: parsedFrom, toStatus: parsedTo };
}

function sortNotifications(notifications: InboxNotification[]) {
  return [...notifications].sort((left, right) => (
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  ));
}

function buildFormData(notificationId: string, unread?: boolean) {
  const formData = new FormData();
  formData.set("notification_id", notificationId);
  if (typeof unread === "boolean") formData.set("unread", String(unread));
  return formData;
}

function getNotificationTone(notification: InboxNotification) {
  if (notification.kind !== "status_changed") return defaultTone;
  const transition = getStatusTransition(notification);
  return transition ? statusNotificationTone[transition.toStatus] : defaultTone;
}

export function InboxNotificationBoard({
  activeTab,
  notifications,
  clientNames,
  taskNames,
  actorNames,
  timezone,
}: {
  activeTab: "inbox" | "cleared";
  notifications: InboxNotification[];
  clientNames: Record<string, string>;
  taskNames: Record<string, string>;
  actorNames: Record<string, string>;
  timezone: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const timersRef = useRef<Record<string, number>>({});
  const [items, setItems] = useState(notifications);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [exitingIds, setExitingIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function setBusy(notificationId: string, pending: boolean) {
    setBusyIds((current) => {
      if (pending) return current.includes(notificationId) ? current : [...current, notificationId];
      return current.filter((value) => value !== notificationId);
    });
  }

  function setExiting(notificationId: string, exiting: boolean) {
    setExitingIds((current) => {
      if (exiting) return current.includes(notificationId) ? current : [...current, notificationId];
      return current.filter((value) => value !== notificationId);
    });
  }

  function removeNotificationSoon(notificationId: string) {
    if (timersRef.current[notificationId]) return;
    timersRef.current[notificationId] = window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== notificationId));
      delete timersRef.current[notificationId];
    }, 180);
  }

  function cancelRemoval(notificationId: string) {
    const timer = timersRef.current[notificationId];
    if (!timer) return;
    window.clearTimeout(timer);
    delete timersRef.current[notificationId];
  }

  function handleDismiss(notification: InboxNotification, action: "clear" | "restore") {
    setError("");
    setBusy(notification.id, true);
    setExiting(notification.id, true);
    removeNotificationSoon(notification.id);

    startTransition(async () => {
      try {
        const formData = buildFormData(notification.id);
        if (action === "clear") await clearNotification(formData);
        else await restoreNotification(formData);
        router.refresh();
      } catch (actionError) {
        cancelRemoval(notification.id);
        setExiting(notification.id, false);
        setItems((current) => current.some((item) => item.id === notification.id)
          ? current
          : sortNotifications([...current, notification]));
        setError(actionError instanceof Error ? actionError.message : "Could not update notification.");
      } finally {
        setBusy(notification.id, false);
      }
    });
  }

  function handleReadToggle(notification: InboxNotification, nextUnread: boolean) {
    setError("");
    setBusy(notification.id, true);
    const previousReadAt = notification.read_at;
    setItems((current) => current.map((item) => item.id === notification.id
      ? { ...item, read_at: nextUnread ? null : new Date().toISOString() }
      : item));

    startTransition(async () => {
      try {
        await setNotificationReadState(buildFormData(notification.id, nextUnread));
        router.refresh();
      } catch (actionError) {
        setItems((current) => current.map((item) => item.id === notification.id
          ? { ...item, read_at: previousReadAt }
          : item));
        setError(actionError instanceof Error ? actionError.message : "Could not update notification.");
      } finally {
        setBusy(notification.id, false);
      }
    });
  }

  const unread = items.filter((notification) => !notification.read_at);
  const read = items.filter((notification) => !!notification.read_at);

  if (!items.length) {
    return activeTab === "inbox"
      ? <EmptyState title="Inbox clear" description="Watch a task or get mentioned in a comment to receive updates here." />
      : <EmptyState title="No cleared notifications" description="Cleared notifications will stay here for reference." />;
  }

  return (
    <>
      {error && <p className="mb-4 text-xs text-red-600">{error}</p>}

      {activeTab === "inbox" && !!unread.length && (
        <NotificationSection
          title="Unread"
          notifications={unread}
          clientNames={clientNames}
          taskNames={taskNames}
          actorNames={actorNames}
          timezone={timezone}
          busyIds={busyIds}
          exitingIds={exitingIds}
          onClear={handleDismiss}
          onReadToggle={handleReadToggle}
        />
      )}
      {activeTab === "inbox" && !!read.length && (
        <NotificationSection
          title="Earlier"
          notifications={read}
          clientNames={clientNames}
          taskNames={taskNames}
          actorNames={actorNames}
          timezone={timezone}
          busyIds={busyIds}
          exitingIds={exitingIds}
          onClear={handleDismiss}
          onReadToggle={handleReadToggle}
        />
      )}
      {activeTab === "cleared" && !!items.length && (
        <NotificationSection
          title="Cleared"
          notifications={items}
          clientNames={clientNames}
          taskNames={taskNames}
          actorNames={actorNames}
          timezone={timezone}
          busyIds={busyIds}
          exitingIds={exitingIds}
          onRestore={handleDismiss}
          cleared
        />
      )}
    </>
  );
}

function NotificationSection({
  title,
  notifications,
  clientNames,
  taskNames,
  actorNames,
  timezone,
  busyIds,
  exitingIds,
  onClear,
  onRestore,
  onReadToggle,
  cleared = false,
}: {
  title: string;
  notifications: InboxNotification[];
  clientNames: Record<string, string>;
  taskNames: Record<string, string>;
  actorNames: Record<string, string>;
  timezone: string;
  busyIds: string[];
  exitingIds: string[];
  onClear?: (notification: InboxNotification, action: "clear") => void;
  onRestore?: (notification: InboxNotification, action: "restore") => void;
  onReadToggle?: (notification: InboxNotification, nextUnread: boolean) => void;
  cleared?: boolean;
}) {
  return (
    <section className="mb-12">
      <div className="mb-3 flex items-center justify-between border-b border-zinc-950 pb-3">
        <h2 className="ui-section-title"><Bell className="size-3.5 text-blue-600" />{title}</h2>
        <span className="font-mono text-[10px] text-zinc-400">{String(notifications.length).padStart(2, "0")}</span>
      </div>
      <div className="divide-y border-y bg-white">
        {notifications.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            actorName={actorNames[notification.actor_id ?? ""] ?? "Former member"}
            clientName={clientNames[notification.client_id] ?? "Client"}
            taskName={taskNames[notification.task_id] ?? notification.metadata.task_title ?? "Task"}
            timezone={timezone}
            busy={busyIds.includes(notification.id)}
            exiting={exitingIds.includes(notification.id)}
            onClear={onClear}
            onRestore={onRestore}
            onReadToggle={onReadToggle}
            cleared={cleared}
          />
        ))}
      </div>
    </section>
  );
}

function NotificationRow({
  notification,
  actorName,
  clientName,
  taskName,
  timezone,
  busy,
  exiting,
  onClear,
  onRestore,
  onReadToggle,
  cleared,
}: {
  notification: InboxNotification;
  actorName: string;
  clientName: string;
  taskName: string;
  timezone: string;
  busy: boolean;
  exiting: boolean;
  onClear?: (notification: InboxNotification, action: "clear") => void;
  onRestore?: (notification: InboxNotification, action: "restore") => void;
  onReadToggle?: (notification: InboxNotification, nextUnread: boolean) => void;
  cleared: boolean;
}) {
  const Icon = notification.kind === "mention"
    ? AtSign
    : notification.kind === "status_changed"
      ? RefreshCw
      : MessageSquareText;
  const unread = !notification.read_at;
  const tone = getNotificationTone(notification);
  const rowClass = unread && !cleared ? tone.unreadRow : "bg-white";

  return (
    <article
      className={`grid gap-4 px-4 py-4 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none sm:grid-cols-[auto_minmax(0,1fr)_auto] ${rowClass} ${exiting ? "translate-x-6 opacity-0 pointer-events-none" : "translate-x-0 opacity-100"}`}
    >
      <span className={`hidden size-8 place-items-center border sm:grid ${tone.tile}`}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`grid size-8 place-items-center border sm:hidden ${tone.tile}`}>
            <Icon className="size-3.5" />
          </span>
          <h3 className="text-sm font-semibold uppercase tracking-[0.03em] text-zinc-950">
            <NotificationHeadline notification={notification} actorName={actorName} />
          </h3>
          {unread && !cleared && (
            <span className={`border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${tone.unreadBadge}`}>
              Unread
            </span>
          )}
        </div>

        <NotificationBody notification={notification} tone={tone} />

        <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          {clientName} · {taskName}
        </p>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-3 sm:items-end">
        <time dateTime={notification.created_at} className="w-full whitespace-nowrap text-left text-[9px] uppercase tracking-[0.06em] text-zinc-400 sm:text-right">
          {formatDateTime(notification.created_at, timezone)}
        </time>
        <div className="flex flex-wrap items-center gap-1 sm:justify-end">
          <form action={openNotification}>
            <input type="hidden" name="notification_id" value={notification.id} />
            <NotificationActionButton disabled={busy || exiting} title="Open notification" tone="accent">
              <Eye className="size-3.5" />
              <span className="sr-only">Open notification</span>
            </NotificationActionButton>
          </form>
          {cleared ? (
            <NotificationActionButton
              type="button"
              disabled={busy || exiting}
              title="Restore notification"
              onClick={() => onRestore?.(notification, "restore")}
            >
              <RotateCcw className="size-3.5" />
              <span className="sr-only">Restore notification</span>
            </NotificationActionButton>
          ) : (
            <>
              <NotificationActionButton
                type="button"
                disabled={busy || exiting}
                title="Clear notification"
                tone="destructive"
                onClick={() => onClear?.(notification, "clear")}
              >
                <X className="size-3.5" />
                <span className="sr-only">Clear notification</span>
              </NotificationActionButton>
              <NotificationActionButton
                type="button"
                disabled={busy || exiting}
                title={unread ? "Mark notification read" : "Mark notification unread"}
                onClick={() => onReadToggle?.(notification, !unread)}
              >
                {unread ? <MailOpen className="size-3.5" /> : <Bell className="size-3.5" />}
                <span className="sr-only">{unread ? "Mark notification read" : "Mark notification unread"}</span>
              </NotificationActionButton>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function NotificationActionButton({
  tone = "default",
  className = "",
  ...props
}: ComponentProps<"button"> & {
  tone?: "default" | "accent" | "destructive";
}) {
  const toneClass = tone === "accent"
    ? "text-blue-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
    : tone === "destructive"
      ? "text-zinc-400 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
      : "text-zinc-400 hover:border-zinc-200 hover:bg-zinc-100 hover:text-zinc-950";

  return (
    <button
      {...props}
      className={`ui-action-ghost size-8 p-0 disabled:opacity-40 ${toneClass} ${className}`}
    />
  );
}

function NotificationHeadline({ notification, actorName }: { notification: InboxNotification; actorName: string }) {
  if (notification.kind === "mention") return <>{actorName} mentioned you</>;
  if (notification.kind === "status_changed") {
    const transition = getStatusTransition(notification);
    if (transition) {
      return <>{actorName} changed status {formatLabel(transition.fromStatus)} → {formatLabel(transition.toStatus)}</>;
    }
    return <>{actorName} changed status</>;
  }
  return <>{actorName} commented</>;
}

function NotificationBody({
  notification,
  tone,
}: {
  notification: InboxNotification;
  tone: NotificationTone;
}) {
  if (notification.kind === "status_changed") {
    const transition = getStatusTransition(notification);
    const fromStatus = transition?.fromStatus ?? null;
    const toStatus = transition?.toStatus ?? null;

    if (fromStatus && toStatus) {
      const genericBody = `Status changed from ${fromStatus.replaceAll("_", " ")} to ${toStatus.replaceAll("_", " ")}.`;
      const showBody = notification.body && notification.body.trim().toLowerCase() !== genericBody.toLowerCase();
      return (
        <div className="mt-2 space-y-2">
          <div className={`inline-flex flex-wrap items-center gap-2 border px-3 py-2 text-sm ${tone.changeSurface}`}>
            <StatusPill status={fromStatus} />
            <span className={`text-base ${tone.arrow}`}>→</span>
            <StatusPill status={toStatus} />
          </div>
          {showBody && <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-600">{notification.body}</p>}
        </div>
      );
    }
  }

  if (notification.body) {
    return <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{notification.body}</p>;
  }

  return <p className="mt-2 text-sm text-zinc-400">{notification.title}</p>;
}

function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${taskStatusTone[status]}`}>
      {formatLabel(status)}
    </span>
  );
}
