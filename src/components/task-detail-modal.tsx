"use client";

import {
  Check,
  CircleUserRound,
  Eye,
  Flag,
  Folder,
  GitBranch,
  Link2,
  ListTodo,
  MessageSquareText,
  MoveUpRight,
  Palette,
  Text,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type Ref } from "react";
import { getTaskDetail, updateTaskDates, updateTaskField } from "@/actions/crm";
import { toggleTaskWatch } from "@/actions/inbox";
import { CommentComposer } from "@/components/comment-composer";
import { StatusPill } from "@/components/status-pill";
import { SubtaskComposer } from "@/components/subtask-composer";
import { TaskDateRangePicker } from "@/components/task-date-range-picker";
import { TaskDescriptionEditor } from "@/components/task-description-editor";
import { TaskLifecycleActions } from "@/components/task-lifecycle-actions";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { taskPriorityTone, taskStatusTone } from "@/lib/task-tones";
import { formatDateTime, formatLabel } from "@/lib/utils";

export type TaskAttachment = {
  id: string;
  file_name: string;
  content_type: string | null;
  size_bytes: number;
  storage_path: string;
  signed_url?: string;
};

export type TaskComment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  task_comment_attachments?: TaskAttachment[];
};

export type TaskSummary = {
  id: string;
  client_id: string;
  share_code?: string | null;
  title: string;
  status: string;
  priority: string;
  created_by?: string | null;
  assignee_id: string | null;
  task_list_id: string | null;
  parent_task_id: string | null;
  source_recurring_rule_id?: string | null;
  start_date: string | null;
  due_date: string | null;
  clients?: { name: string } | null;
  parent_task?: { id: string; title: string; task_list_id?: string | null; archived_at?: string | null } | null;
};

export type TaskDetail = TaskSummary & {
  description: string | null;
  original_context?: string | null;
  ai_generated?: boolean;
  task_comments?: TaskComment[];
  task_watchers?: Array<{ user_id: string }>;
};

export type TaskReference = {
  id: string;
  client_id: string;
  task_list_id: string | null;
  parent_task_id: string | null;
  title: string;
  status: string;
  archived_at: string | null;
};

export type LinkedCreativeRequest = {
  id: string;
  client_id: string;
  title: string;
  status: string;
  due_date: string;
  source_task_id: string | null;
  archived_at: string | null;
};

type Member = { user_id: string; display_name: string | null; email: string | null };
type List = { id: string; name: string; kind?: string; client_id?: string };
type EditableTaskValues = {
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string;
  task_list_id: string;
  parent_task_id: string;
  start_date: string;
  due_date: string;
};

function editableValuesForTask(task: TaskSummary | TaskDetail): EditableTaskValues {
  return {
    title: task.title,
    description: "description" in task ? task.description ?? "" : "",
    status: task.status,
    priority: task.priority,
    assignee_id: task.assignee_id ?? "",
    task_list_id: task.task_list_id ?? "",
    parent_task_id: task.parent_task_id ?? "",
    start_date: task.start_date ?? "",
    due_date: task.due_date ?? "",
  };
}

function detailFromSummary(task: TaskSummary): TaskDetail {
  return {
    ...task,
    description: null,
    original_context: null,
    ai_generated: false,
    task_comments: [],
    task_watchers: [],
  };
}

function detailFieldValue(field: keyof EditableTaskValues, value: string) {
  if (field === "description") return value || null;
  if (field === "assignee_id" || field === "task_list_id" || field === "parent_task_id" || field === "start_date" || field === "due_date") {
    return value || null;
  }
  return value;
}

function descendantTaskIds(taskId: string, references: TaskReference[]) {
  const descendants = new Set<string>();
  const queue = [taskId];
  while (queue.length) {
    const parentId = queue.shift();
    references.forEach((reference) => {
      if (reference.parent_task_id === parentId && !descendants.has(reference.id)) {
        descendants.add(reference.id);
        queue.push(reference.id);
      }
    });
  }
  return descendants;
}

export function TaskDetailModal({
  task,
  lists,
  members,
  taskReferences,
  creativeRequests = [],
  agencyId,
  currentUserId,
  currentUserRole,
  timezone,
  initiallyOpen = false,
  triggerRef,
}: {
  task: TaskSummary;
  lists: List[];
  members: Member[];
  taskReferences: TaskReference[];
  creativeRequests?: LinkedCreativeRequest[];
  agencyId: string;
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
  timezone: string;
  initiallyOpen?: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const taskData = detail ?? detailFromSummary(task);
  const [watching, setWatching] = useState(false);
  const [watcherCount, setWatcherCount] = useState(0);
  const [values, setValues] = useState<EditableTaskValues>(() => editableValuesForTask(taskData));
  const persistedValues = useRef<EditableTaskValues>(editableValuesForTask(taskData));
  const inFlightSaves = useRef(new Map<string, Promise<boolean>>());
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [completionFlash, setCompletionFlash] = useState(false);
  const [mobileTab, setMobileTab] = useState<"activity" | "details">("activity");
  const [showAllComments, setShowAllComments] = useState(false);
  const searchParams = useSearchParams();
  const focusedTaskIdFromUrl = searchParams.get("task");
  const closedForFocusedUrlRef = useRef<string | null>(null);
  const copyStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const memberNames = new Map(members.map((member) => [member.user_id, member.display_name || member.email || "Member"]));
  const hasDetail = Boolean(detail);

  const syncAudience = useCallback((nextTask: TaskDetail) => {
    const nextWatcherCount = nextTask.task_watchers?.length ?? 0;
    setWatching(nextTask.task_watchers?.some((watcher) => watcher.user_id === currentUserId) ?? false);
    setWatcherCount(nextWatcherCount);
  }, [currentUserId]);

  const loadDetail = useCallback(async ({ syncForm = false }: { syncForm?: boolean } = {}) => {
    setDetailLoading(true);
    setDetailError("");
    try {
      const nextTask = await getTaskDetail({ clientId: task.client_id, taskId: task.id }) as unknown as TaskDetail;
      setDetail(nextTask);
      syncAudience(nextTask);
      if (syncForm) {
        const nextValues = editableValuesForTask(nextTask);
        const baseline = persistedValues.current;
        setValues((current) => {
          return {
            title: current.title === baseline.title ? nextValues.title : current.title,
            description: current.description === baseline.description ? nextValues.description : current.description,
            status: current.status === baseline.status ? nextValues.status : current.status,
            priority: current.priority === baseline.priority ? nextValues.priority : current.priority,
            assignee_id: current.assignee_id === baseline.assignee_id ? nextValues.assignee_id : current.assignee_id,
            task_list_id: current.task_list_id === baseline.task_list_id ? nextValues.task_list_id : current.task_list_id,
            parent_task_id: current.parent_task_id === baseline.parent_task_id ? nextValues.parent_task_id : current.parent_task_id,
            start_date: current.start_date === baseline.start_date ? nextValues.start_date : current.start_date,
            due_date: current.due_date === baseline.due_date ? nextValues.due_date : current.due_date,
          };
        });
        persistedValues.current = nextValues;
      }
      return nextTask;
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Could not load task details.");
      return null;
    } finally {
      setDetailLoading(false);
    }
  }, [syncAudience, task.client_id, task.id]);

  const comments = useMemo(
    () => [...(taskData.task_comments ?? [])].sort((a, b) => {
      const dateOrder = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return dateOrder || a.id.localeCompare(b.id);
    }),
    [taskData.task_comments],
  );
  const hiddenCommentCount = Math.max(0, comments.length - 5);
  const visibleComments = showAllComments ? comments : comments.slice(-5);
  const parentTask = taskData.parent_task_id
    ? taskReferences.find((candidate) => candidate.id === taskData.parent_task_id) ?? taskData.parent_task ?? null
    : null;
  const subtasks = taskReferences.filter((candidate) => candidate.parent_task_id === task.id && !candidate.archived_at);
  const linkedCreativeRequests = creativeRequests
    .filter((request) => request.source_task_id === task.id && !request.archived_at)
    .sort((left, right) => left.due_date.localeCompare(right.due_date) || left.title.localeCompare(right.title));
  const descendantIds = descendantTaskIds(task.id, taskReferences);
  const selectableParents = taskReferences.filter((candidate) =>
    candidate.id !== task.id
    && !candidate.archived_at
    && candidate.status !== "complete"
    && !descendantIds.has(candidate.id),
  );
  const currentUnavailableParent = parentTask
    && !selectableParents.some((candidate) => candidate.id === parentTask.id)
    ? parentTask
    : null;
  const parentOptions = [
    { value: "", label: "No parent" },
    ...(currentUnavailableParent ? [{
      value: currentUnavailableParent.id,
      label: `${currentUnavailableParent.title} (${currentUnavailableParent.archived_at ? "archived" : "complete"})`,
      disabled: true,
    }] : []),
    ...selectableParents.map((candidate) => ({ value: candidate.id, label: candidate.title })),
  ];
  const canManageTaskLifecycle = currentUserRole === "owner"
    || currentUserRole === "admin"
    || taskData.created_by === currentUserId;

  const listParamForTaskListId = useCallback((taskListId?: string | null) => {
    if (!taskListId) return "general";
    const matchingList = lists.find((list) => list.id === taskListId);
    if (matchingList?.kind === "general" || matchingList?.kind === "recurring") return matchingList.kind;
    return taskListId;
  }, [lists]);

  const taskHref = useCallback((target: { id: string; task_list_id?: string | null }) => {
    return `/clients/${task.client_id}?tab=tasks&list=${listParamForTaskListId(target.task_list_id ?? values.task_list_id ?? task.task_list_id)}&task=${target.id}`;
  }, [listParamForTaskListId, task.client_id, task.task_list_id, values.task_list_id]);

  const syncBrowserTaskUrl = useCallback((targetTaskId: string | null, taskListId?: string | null) => {
    if (typeof window === "undefined") return;
    const clientPath = `/clients/${task.client_id}`;
    if (window.location.pathname !== clientPath) return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "tasks");
    params.set("list", listParamForTaskListId(taskListId ?? values.task_list_id ?? task.task_list_id));
    if (targetTaskId) params.set("task", targetTaskId);
    else params.delete("task");
    const nextSearch = params.toString();
    window.history.replaceState(window.history.state, "", nextSearch ? `${clientPath}?${nextSearch}` : clientPath);
  }, [listParamForTaskListId, task.client_id, task.task_list_id, values.task_list_id]);

  function setTransientCopyState(nextState: "copied" | "error") {
    if (copyStateTimer.current) clearTimeout(copyStateTimer.current);
    setCopyState(nextState);
    copyStateTimer.current = setTimeout(() => {
      copyStateTimer.current = null;
      setCopyState("idle");
    }, 1800);
  }

  function fallbackCopyText(text: string) {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(input);
    return copied;
  }

  async function copyTaskLink() {
    if (typeof window === "undefined") return;
    const href = task.share_code
      ? `/t/${task.share_code}`
      : taskHref({ id: task.id, task_list_id: values.task_list_id || task.task_list_id });
    const shareUrl = new URL(href, window.location.origin).toString();
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(shareUrl);
      else if (!fallbackCopyText(shareUrl)) throw new Error("Clipboard unavailable");
      setTransientCopyState("copied");
    } catch {
      setTransientCopyState("error");
    }
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const openTask = useCallback(() => {
    closedForFocusedUrlRef.current = null;
    const currentValues = editableValuesForTask(detail ?? detailFromSummary(task));
    persistedValues.current = currentValues;
    setValues(currentValues);
    setMessage("");
    setMobileTab("activity");
    setShowAllComments(false);
    syncBrowserTaskUrl(task.id, currentValues.task_list_id || task.task_list_id);
    setOpen(true);
    return loadDetail({ syncForm: !hasDetail });
  }, [detail, hasDetail, loadDetail, syncBrowserTaskUrl, task]);

  useEffect(() => {
    if (!initiallyOpen || focusedTaskIdFromUrl !== task.id || open) return;
    if (closedForFocusedUrlRef.current === focusedTaskIdFromUrl) return;
    const timer = window.setTimeout(() => {
      void openTask();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusedTaskIdFromUrl, initiallyOpen, open, openTask, task.id]);

  useEffect(() => () => {
    if (completionTimer.current) clearTimeout(completionTimer.current);
    if (copyStateTimer.current) clearTimeout(copyStateTimer.current);
  }, []);

  function animateCompletion() {
    if (completionTimer.current) clearTimeout(completionTimer.current);
    setCompletionFlash(true);
    completionTimer.current = setTimeout(() => {
      completionTimer.current = null;
      setCompletionFlash(false);
    }, 700);
  }

  function cancelCompletion() {
    if (completionTimer.current) clearTimeout(completionTimer.current);
    completionTimer.current = null;
    setCompletionFlash(false);
  }

  async function persistField(field: keyof EditableTaskValues, inputValue: string) {
    const value = field === "title" ? inputValue.trim() : inputValue;
    if (field === "title" && !value.trim()) {
      setValues((current) => ({ ...current, title: persistedValues.current.title }));
      setMessage("Task title cannot be empty.");
      return false;
    }
    setValues((current) => ({ ...current, [field]: value }));
    if (persistedValues.current[field] === value) return true;

    const saveKey = `${field}:${value}`;
    const existingSave = inFlightSaves.current.get(saveKey);
    if (existingSave) return existingSave;
    const completing = field === "status" && persistedValues.current.status !== "complete" && value === "complete";
    if (completing) animateCompletion();

    setMessage("");
    const formData = new FormData();
    formData.set("client_id", task.client_id);
    formData.set("task_id", task.id);
    formData.set("field", field);
    formData.set("value", value);

    const request = (async () => {
      try {
        await updateTaskField(formData);
        if (field === "status" && value === "complete" && task.source_recurring_rule_id) {
          const nextTask = await loadDetail({ syncForm: true });
          if (nextTask) {
            const nextValues = editableValuesForTask(nextTask);
            persistedValues.current = nextValues;
            setValues(nextValues);
            syncBrowserTaskUrl(task.id, nextValues.task_list_id || task.task_list_id);
          }
        } else {
          persistedValues.current = { ...persistedValues.current, [field]: value };
          setDetail((current) => current ? { ...current, [field]: detailFieldValue(field, value) } : current);
          if (field === "task_list_id") syncBrowserTaskUrl(task.id, value);
        }
        setMessage("Saved");
        return true;
      } catch (error) {
        if (completing) cancelCompletion();
        if (field !== "title" && field !== "description") {
          setValues((current) => ({ ...current, [field]: persistedValues.current[field] }));
        }
        setMessage(error instanceof Error ? error.message : "Could not save change.");
        return false;
      } finally {
        inFlightSaves.current.delete(saveKey);
      }
    });
    const saveRequest = request();
    inFlightSaves.current.set(saveKey, saveRequest);
    return saveRequest;
  }

  function save(field: keyof EditableTaskValues, value: string) {
    startTransition(async () => {
      await persistField(field, value);
    });
  }

  function saveDates(startDate: string, dueDate: string) {
    const previousStartDate = persistedValues.current.start_date;
    const previousDueDate = persistedValues.current.due_date;
    setValues((current) => ({ ...current, start_date: startDate, due_date: dueDate }));
    setMessage("");
    const formData = new FormData();
    formData.set("client_id", task.client_id);
    formData.set("task_id", task.id);
    formData.set("start_date", startDate);
    formData.set("due_date", dueDate);
    startTransition(async () => {
      try {
        await updateTaskDates(formData);
        persistedValues.current = { ...persistedValues.current, start_date: startDate, due_date: dueDate };
        setDetail((current) => current ? {
          ...current,
          start_date: startDate || null,
          due_date: dueDate || null,
        } : current);
        setMessage("Saved");
      } catch (error) {
        setValues((current) => ({ ...current, start_date: previousStartDate, due_date: previousDueDate }));
        setMessage(error instanceof Error ? error.message : "Could not save dates.");
      }
    });
  }

  async function closeTask() {
    const titleSaved = await persistField("title", values.title);
    if (titleSaved) {
      closedForFocusedUrlRef.current = focusedTaskIdFromUrl ?? task.id;
      syncBrowserTaskUrl(null, values.task_list_id || task.task_list_id);
      setOpen(false);
    }
  }

  function toggleWatch() {
    if (!hasDetail) return;
    const previous = watching;
    setWatching(!previous);
    setWatcherCount((count) => Math.max(0, count + (previous ? -1 : 1)));
    const formData = new FormData();
    formData.set("client_id", task.client_id);
    formData.set("task_id", task.id);
    formData.set("watching", String(previous));
    startTransition(async () => {
      try {
        await toggleTaskWatch(formData);
        setMessage(previous ? "No longer watching" : "Watching");
      } catch (error) {
        setWatching(previous);
        setWatcherCount((count) => Math.max(0, count + (previous ? 1 : -1)));
        setMessage(error instanceof Error ? error.message : "Could not update watcher.");
      }
    });
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={openTask} className="group block max-w-full text-left">
        <span className="text-sm font-normal text-zinc-950 group-hover:text-blue-700 group-hover:underline">{task.title}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-3 backdrop-blur-[1px] sm:p-6"
          onMouseDown={() => void closeTask()}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={values.title}
            className={`flex h-[min(860px,calc(100vh-24px))] w-[min(1120px,calc(100vw-24px))] flex-col border border-zinc-950 bg-white text-left shadow-2xl sm:h-[min(860px,calc(100vh-48px))] ${completionFlash ? "task-completion-flash" : ""}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-center gap-2 border-b border-zinc-950 px-3 py-3 sm:gap-4 sm:px-5">
              <ListTodo className="size-4 text-blue-600" />
              <p className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                {task.clients?.name ?? "Client"} / {lists.find((list) => list.id === values.task_list_id)?.name ?? "General"}
              </p>
              <button
                type="button"
                onClick={() => void copyTaskLink()}
                title={copyState === "copied" ? "Task link copied" : copyState === "error" ? "Copy task link failed" : "Copy shareable task link"}
                aria-label={copyState === "copied" ? "Task link copied" : copyState === "error" ? "Copy task link failed" : "Copy task link"}
                className={`flex min-w-9 items-center justify-center gap-1.5 border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                  copyState === "copied"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : copyState === "error"
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "border-zinc-300 bg-white text-zinc-600 hover:border-blue-400 hover:text-blue-700"
                }`}
              >
                {copyState === "copied" ? <Check className="size-3.5" /> : copyState === "error" ? <X className="size-3.5" /> : <Link2 className="size-3.5" />}
                <span className="hidden sm:inline">{copyState === "copied" ? "Link copied" : copyState === "error" ? "Copy failed" : "Copy link"}</span>
              </button>
              <button
                type="button"
                onClick={toggleWatch}
                title={watching ? "Stop receiving task updates" : "Receive comment and status updates"}
                aria-label={watching ? "Unwatch task" : "Watch task"}
                className={`flex min-w-9 items-center justify-center gap-1.5 border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                  watching
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-zinc-300 bg-white text-zinc-600 hover:border-blue-400 hover:text-blue-700"
                }`}
                aria-pressed={watching}
                disabled={!hasDetail}
              >
                <Eye className="size-3.5" />
                <span className="hidden sm:inline">{watching ? "Watching" : "Watch task"}{watcherCount > 0 ? ` · ${watcherCount}` : ""}</span>
                {watcherCount > 0 && <span className="rounded-full bg-current/12 px-1 py-0.5 text-[8px] leading-none sm:hidden">{watcherCount}</span>}
              </button>
              <span className={`text-[9px] font-semibold uppercase tracking-[0.1em] ${message === "Saved" ? "text-emerald-600" : "text-red-600"}`}>
                {pending ? "Saving..." : message}
              </span>
              <TaskLifecycleActions
                clientId={task.client_id}
                taskId={task.id}
                taskTitle={values.title}
                canArchive={canManageTaskLifecycle}
                canDelete={canManageTaskLifecycle}
              />
              <button type="button" onClick={() => void closeTask()} className="p-1 text-zinc-400 hover:text-zinc-950" aria-label="Close task">
                <X className="size-5" />
              </button>
            </header>

            <nav className="grid grid-cols-2 border-b border-zinc-950 lg:hidden" aria-label="Task view">
              <MobileTaskTab active={mobileTab === "activity"} onClick={() => setMobileTab("activity")} icon={<MessageSquareText />}>
                Activity
              </MobileTaskTab>
              <MobileTaskTab active={mobileTab === "details"} onClick={() => setMobileTab("details")} icon={<Text />}>
                Details
              </MobileTaskTab>
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_310px] lg:overflow-hidden">
              <main className="px-5 py-6 sm:px-8 lg:min-h-0 lg:overflow-y-auto">
                <div className={`${mobileTab === "details" ? "block" : "hidden"} lg:block`}>
                  <input
                    value={values.title}
                    onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
                    onBlur={(event) => save("title", event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    className="w-full border-0 border-b border-transparent bg-transparent px-0 pb-3 text-2xl font-medium tracking-[-0.04em] hover:border-zinc-300 focus:border-blue-600 sm:text-3xl"
                    aria-label="Task title"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                    {parentTask && <span className="border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">Subtask</span>}
                    {subtasks.length > 0 && <span className="border border-violet-200 bg-violet-50 px-2 py-1 text-violet-700">Parent task · {subtasks.length} subtask{subtasks.length === 1 ? "" : "s"}</span>}
                  </div>
                  {parentTask && (
                    parentTask.archived_at ? (
                      <div className="mt-3 flex items-center gap-2 border-l-2 border-zinc-400 bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
                        <GitBranch className="size-3.5" />
                        <span className="font-semibold uppercase tracking-[0.05em]">Archived parent task</span>
                        <span className="truncate">{parentTask.title}</span>
                      </div>
                    ) : (
                      <Link
                        href={taskHref(parentTask)}
                        onClick={() => setOpen(false)}
                        className="mt-3 flex items-center gap-2 border-l-2 border-blue-500 bg-blue-50 px-3 py-2 text-xs text-blue-800 hover:bg-blue-100"
                      >
                        <GitBranch className="size-3.5" />
                        <span className="font-semibold uppercase tracking-[0.05em]">Parent task</span>
                        <span className="truncate">{parentTask.title}</span>
                        <MoveUpRight className="ml-auto size-3.5 shrink-0" />
                      </Link>
                    )
                  )}

                  <section className="mt-8">
                    <h2 className="ui-section-title mb-3"><Text className="size-3.5 text-blue-600" />Description</h2>
                    {hasDetail ? (
                      <TaskDescriptionEditor value={values.description} onSave={(value) => save("description", value)} />
                    ) : (
                      <div className="min-h-36 border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-400">
                        {detailLoading ? "Loading description..." : detailError || "Description is unavailable right now."}
                      </div>
                    )}
                  </section>

                  <section className="mt-10 border-t border-zinc-950 pt-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="ui-section-title"><GitBranch className="size-3.5 text-blue-600" />Subtasks</h2>
                      <span className="font-mono text-[10px] text-zinc-400">{String(subtasks.length).padStart(2, "0")}</span>
                    </div>
                    {!!subtasks.length && (
                      <div className="mb-3 divide-y border-y border-zinc-200 bg-white">
                        {subtasks.map((subtask) => (
                          <div key={subtask.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-blue-50/60">
                            <Link
                              href={taskHref(subtask)}
                              onClick={() => setOpen(false)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left normal-case tracking-normal text-zinc-800 hover:text-blue-700"
                            >
                              <GitBranch className="size-3.5 shrink-0 text-blue-500" />
                              <span className="truncate">{subtask.title}</span>
                              <MoveUpRight className="size-3 shrink-0 text-zinc-300" />
                            </Link>
                            {subtask.status && <span className={`border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${taskStatusTone[subtask.status] ?? taskStatusTone.todo}`}>{formatLabel(subtask.status)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    <SubtaskComposer clientId={task.client_id} parentTaskId={task.id} members={members} defaultAssigneeId={values.assignee_id || null} defaultStartDate={values.start_date || null} defaultDueDate={values.due_date || null} />
                  </section>

                  <section className="mt-10 border-t border-zinc-950 pt-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="ui-section-title"><Palette className="size-3.5 text-violet-600" />Creative requests</h2>
                      <Link
                        href={`/creative-master?clientId=${task.client_id}&sourceTaskId=${task.id}`}
                        onClick={() => setOpen(false)}
                        className="text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700 hover:underline"
                      >
                        New request
                      </Link>
                    </div>
                    {!!linkedCreativeRequests.length && (
                      <div className="mb-3 divide-y border-y border-zinc-200 bg-white">
                        {linkedCreativeRequests.map((request) => (
                          <Link
                            key={request.id}
                            href={`/creative-master?request=${request.id}`}
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-violet-50/60"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-zinc-800">{request.title}</p>
                              <p className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-zinc-400">Due {request.due_date}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusPill value={request.status} />
                              <MoveUpRight className="size-3 shrink-0 text-zinc-300" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                    {!linkedCreativeRequests.length && <p className="text-sm text-zinc-500">No creative requests linked to this task yet.</p>}
                  </section>
                </div>

                <section className={`${mobileTab === "activity" ? "block" : "hidden"} lg:mt-10 lg:block lg:border-t lg:border-zinc-950 lg:pt-5`}>
                  <h2 className="ui-section-title mb-4"><MessageSquareText className="size-3.5 text-blue-600" />Comments</h2>
                  {hasDetail ? (
                    <div className="space-y-3">
                      {hiddenCommentCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowAllComments((current) => !current)}
                          className="w-full border-y border-zinc-200 py-2 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-400 hover:bg-zinc-50 hover:text-blue-700"
                        >
                          {showAllComments ? "Hide older comments" : `Show ${hiddenCommentCount} older comment${hiddenCommentCount === 1 ? "" : "s"}`}
                        </button>
                      )}
                      {visibleComments.map((comment) => (
                        <article key={comment.id} className="border-b border-zinc-200 pb-4 text-sm">
                          {comment.body && <p className="whitespace-pre-wrap leading-6">{comment.body}</p>}
                          {!!comment.task_comment_attachments?.length && (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {comment.task_comment_attachments.map((attachment) => <AttachmentPreview key={attachment.id} attachment={attachment} />)}
                            </div>
                          )}
                          <p className="mt-2 text-[10px] uppercase tracking-[0.05em] text-zinc-400">
                            {comment.author_id ? memberNames.get(comment.author_id) ?? "Member" : "Former member"} · <time dateTime={comment.created_at}>{formatDateTime(comment.created_at, timezone)}</time>
                          </p>
                        </article>
                      ))}
                      {!comments.length && <p className="text-sm text-zinc-400">No comments yet.</p>}
                    </div>
                  ) : (
                    <div className="border-y border-zinc-200 py-4 text-sm text-zinc-400">
                      {detailLoading ? "Loading activity..." : detailError || "Activity is unavailable right now."}
                    </div>
                  )}
                  <CommentComposer
                    agencyId={agencyId}
                    clientId={task.client_id}
                    taskId={task.id}
                    members={members}
                    onCommentAdded={async () => {
                      if (!watching) {
                        setWatching(true);
                        setWatcherCount((count) => count + 1);
                      }
                      await loadDetail();
                    }}
                  />
                </section>
              </main>

              <aside className={`${mobileTab === "details" ? "block" : "hidden"} border-t border-zinc-950 bg-zinc-50 px-5 py-6 lg:block lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0`}>
                <p className="ui-kicker mb-5">Task attributes</p>
                <div className="space-y-5">
                  <AttributeSelect icon={<Check />} label="Status" value={values.status} tone={taskStatusTone[values.status]} options={TASK_STATUSES.map((value) => ({ value, label: formatLabel(value) }))} onChange={(value) => save("status", value)} />
                  <AttributeSelect icon={<Flag />} label="Priority" value={values.priority} tone={taskPriorityTone[values.priority]} options={TASK_PRIORITIES.map((value) => ({ value, label: formatLabel(value) }))} onChange={(value) => save("priority", value)} />
                  <AttributeSelect
                    icon={<CircleUserRound />}
                    label="Assignee"
                    value={values.assignee_id}
                    options={[{ value: "", label: "Unassigned" }, ...members.map((member) => ({ value: member.user_id, label: member.display_name || member.email || "Member" }))]}
                    onChange={(value) => save("assignee_id", value)}
                  />
                  <AttributeSelect icon={<Folder />} label="List" value={values.task_list_id} options={lists.map((list) => ({ value: list.id, label: list.name }))} onChange={(value) => save("task_list_id", value)} />
                  <AttributeSelect
                    icon={<GitBranch />}
                    label="Parent task"
                    value={values.parent_task_id}
                    options={parentOptions}
                    onChange={(value) => save("parent_task_id", value)}
                  />
                  <AttributeDateRange
                    clientId={task.client_id}
                    taskId={task.id}
                    isRecurring={Boolean(task.source_recurring_rule_id)}
                    startDate={values.start_date}
                    dueDate={values.due_date}
                    disabled={pending}
                    onChange={saveDates}
                    onRecurrenceSaved={({ recurringListId, startDate, dueDate }) => {
                      setValues((current) => ({ ...current, task_list_id: recurringListId, start_date: startDate, due_date: dueDate }));
                      persistedValues.current = { ...persistedValues.current, task_list_id: recurringListId, start_date: startDate, due_date: dueDate };
                      setMessage("Saved");
                    }}
                    onRecurrenceStopped={() => setMessage("Recurrence stopped")}
                  />
                </div>
              </aside>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function MobileTaskTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactElement<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-center gap-2 border-b px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] ${
        active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-zinc-400"
      }`}
    >
      <span className="[&>svg]:size-3.5">{icon}</span>
      {children}
    </button>
  );
}

function AttributeSelect({
  icon,
  label,
  value,
  options,
  onChange,
  tone = "",
}: {
  icon: React.ReactElement<{ className?: string }>;
  label: string;
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  onChange: (value: string) => void;
  tone?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
        <span className="[&>svg]:size-3.5 [&>svg]:text-blue-600">{icon}</span>{label}
      </span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)} className={`w-full border px-2 py-2 text-xs hover:border-zinc-950 focus:border-blue-600 ${tone}`}>
        {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
    </label>
  );
}

function AttributeDateRange({
  clientId,
  taskId,
  isRecurring,
  startDate,
  dueDate,
  disabled,
  onChange,
  onRecurrenceSaved,
  onRecurrenceStopped,
}: {
  clientId: string;
  taskId: string;
  isRecurring: boolean;
  startDate: string;
  dueDate: string;
  disabled: boolean;
  onChange: (startDate: string, dueDate: string) => void;
  onRecurrenceSaved: (result: { recurringListId: string; startDate: string; dueDate: string }) => void;
  onRecurrenceStopped: () => void;
}) {
  return (
    <div>
      <span className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
        Dates
      </span>
      <TaskDateRangePicker
        startDate={startDate}
        dueDate={dueDate}
        disabled={disabled}
        recurrenceTask={{ clientId, taskId, isRecurring }}
        onRecurrenceSaved={onRecurrenceSaved}
        onRecurrenceStopped={onRecurrenceStopped}
        onChange={onChange}
      />
    </div>
  );
}

function AttachmentPreview({ attachment }: { attachment: TaskAttachment }) {
  if (!attachment.signed_url) return <span className="text-xs text-zinc-500">{attachment.file_name}</span>;
  if (attachment.content_type?.startsWith("image/")) {
    return (
      <a href={attachment.signed_url} target="_blank" rel="noreferrer" className="overflow-hidden border bg-zinc-50">
        {/* Signed URLs are short-lived and can safely render directly from Supabase Storage. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.signed_url} alt={attachment.file_name} className="max-h-56 w-full object-contain" />
        <span className="block truncate px-2 py-1 text-xs">{attachment.file_name}</span>
      </a>
    );
  }
  if (attachment.content_type?.startsWith("video/")) {
    return (
      <div className="border bg-zinc-50 p-2">
        <video src={attachment.signed_url} controls className="max-h-64 w-full" />
        <a href={attachment.signed_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs underline">{attachment.file_name}</a>
      </div>
    );
  }
  if (attachment.content_type?.startsWith("audio/")) {
    return (
      <div className="border bg-zinc-50 p-3">
        <audio src={attachment.signed_url} controls className="w-full" />
        <a href={attachment.signed_url} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs underline">{attachment.file_name}</a>
      </div>
    );
  }
  return <a href={attachment.signed_url} target="_blank" rel="noreferrer" className="border bg-zinc-50 px-3 py-2 text-xs font-medium underline">{attachment.file_name}</a>;
}
