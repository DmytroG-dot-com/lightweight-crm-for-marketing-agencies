"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Archive, CalendarDays, Download, ExternalLink, LoaderCircle, Palette, Undo2, X } from "lucide-react";
import Link from "next/link";
import {
  addCreativeRequestComment,
  archiveCreativeRequest,
  autosaveCreativeRequestDetails,
  generateCreativeBrief,
  generateCreativeImages,
  restoreCreativeRequest,
} from "@/actions/creative";
import { StatusPill } from "@/components/status-pill";
import { MAX_GENERATED_CREATIVE_IMAGES } from "@/lib/creative/constants";
import { CREATIVE_STATUSES } from "@/lib/constants";
import { creativeDateTone, formatDateTime, formatLabel } from "@/lib/utils";

type CreativeRequestModalRequest = {
  id: string;
  order_number: number;
  client_id: string;
  status: string;
  title: string;
  hypothesis: string;
  due_date: string;
  assets_needed: number;
  brief: string | null;
  brief_generated_at: string | null;
  references_url: string | null;
  notes: string | null;
  creator_id: string | null;
  persona_id: string | null;
  source_task_id: string | null;
  archived_at: string | null;
  completed_drive_folder_url: string | null;
  clients?: { name: string; status: string } | null;
};

type SourceTask = {
  id: string;
  client_id: string;
  task_list_id: string | null;
  title: string;
};

type Creator = {
  id: string;
  name: string;
  active?: boolean | null;
};

type Persona = {
  id: string;
  client_id: string;
  name: string;
  segment: string | null;
  active: boolean;
  is_primary: boolean;
};

type CreativeRequestComment = {
  id: string;
  creative_request_id: string;
  author_type: "agency" | "creator";
  author_name: string;
  body: string;
  created_at: string;
};

type DraftValues = {
  title: string;
  hypothesis: string;
  status: string;
  due_date: string;
  assets_needed: string;
  brief: string;
  references_url: string;
  notes: string;
  creator_id: string;
  persona_id: string;
  source_task_id: string;
};

type SaveState = "ready" | "dirty" | "saving" | "saved" | "error";

type GeneratedCreativeImage = {
  dataUrl: string;
  filename: string;
  revisedPrompt: string | null;
  size: "1024x1024" | "1024x1536" | "1536x1024";
};

function imageDimensions(size: GeneratedCreativeImage["size"]) {
  if (size === "1024x1536") return { width: 1024, height: 1536 };
  if (size === "1536x1024") return { width: 1536, height: 1024 };
  return { width: 1024, height: 1024 };
}

function taskHref(task: SourceTask | null | undefined) {
  if (!task) return null;
  return `/clients/${task.client_id}?tab=tasks&list=${task.task_list_id ?? "general"}&task=${task.id}`;
}

function normalizeCreativeCountValue(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return "1";
  return String(Math.min(MAX_GENERATED_CREATIVE_IMAGES, Math.max(1, parsed)));
}

function draftFromRequest(request: CreativeRequestModalRequest): DraftValues {
  return {
    title: request.title,
    hypothesis: request.hypothesis,
    status: request.status,
    due_date: request.due_date,
    assets_needed: normalizeCreativeCountValue(String(request.assets_needed)),
    brief: request.brief ?? "",
    references_url: request.references_url ?? "",
    notes: request.notes ?? "",
    creator_id: request.creator_id ?? "",
    persona_id: request.persona_id ?? "",
    source_task_id: request.source_task_id ?? "",
  };
}

function draftKey(values: DraftValues) {
  return JSON.stringify(values);
}

function buildAutosaveFormData(requestId: string, values: DraftValues) {
  const formData = new FormData();
  formData.set("request_id", requestId);
  formData.set("title", values.title);
  formData.set("hypothesis", values.hypothesis);
  formData.set("status", values.status);
  formData.set("due_date", values.due_date);
  formData.set("assets_needed", values.assets_needed);
  formData.set("brief", values.brief);
  formData.set("references_url", values.references_url);
  formData.set("notes", values.notes);
  formData.set("creator_id", values.creator_id);
  formData.set("persona_id", values.persona_id);
  if (values.source_task_id) formData.set("source_task_id", values.source_task_id);
  return formData;
}

export function CreativeRequestModal({
  request,
  comments,
  creators,
  personas,
  aiBriefEnabled,
  aiUsesServerKey,
  aiImageModel,
  canManageCreativeAi,
  sourceTask,
  closeHref,
  timezone,
}: {
  request: CreativeRequestModalRequest;
  comments: CreativeRequestComment[];
  creators: Creator[];
  personas: Persona[];
  aiBriefEnabled: boolean;
  aiUsesServerKey: boolean;
  aiImageModel: string;
  canManageCreativeAi: boolean;
  sourceTask: SourceTask | null;
  closeHref: string;
  timezone: string;
}) {
  const router = useRouter();
  const archived = Boolean(request.archived_at);
  const initialDraft = draftFromRequest(request);
  const [draft, setDraft] = useState<DraftValues>(initialDraft);
  const [saveState, setSaveState] = useState<SaveState>("ready");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentPending, startCommentTransition] = useTransition();
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefPending, startBriefTransition] = useTransition();
  const [imageError, setImageError] = useState<string | null>(null);
  const [imagePending, startImageTransition] = useTransition();
  const [generatedImages, setGeneratedImages] = useState<GeneratedCreativeImage[]>([]);
  const [imagePrompt, setImagePrompt] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<"1024x1024" | "1024x1536" | "1536x1024">("1024x1536");
  const [imageQuality, setImageQuality] = useState<"low" | "medium" | "high">("medium");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const queuedDraftRef = useRef<DraftValues | null>(null);
  const savedKeyRef = useRef(draftKey(initialDraft));
  const closeAfterSaveRef = useRef(false);

  const creatorName = draft.creator_id
    ? creators.find((creator) => creator.id === draft.creator_id)?.name ?? null
    : null;
  const availablePersonas = personas.filter((persona) => persona.client_id === request.client_id && persona.active);
  const personaName = draft.persona_id
    ? availablePersonas.find((persona) => persona.id === draft.persona_id)?.name ?? null
    : null;
  const canGenerateBrief = !archived && canManageCreativeAi && aiBriefEnabled;
  const canGenerateImages = canGenerateBrief && !aiUsesServerKey;

  const flushAutosave = useCallback(async () => {
    if (archived || savingRef.current || !queuedDraftRef.current) return;
    const nextDraft = queuedDraftRef.current;
    const nextKey = draftKey(nextDraft);
    if (nextKey === savedKeyRef.current) {
      queuedDraftRef.current = null;
      setSaveState("ready");
      return;
    }

    queuedDraftRef.current = null;
    savingRef.current = true;
    setSaveState("saving");
    setSaveError(null);

    try {
      await autosaveCreativeRequestDetails(buildAutosaveFormData(request.id, nextDraft));
      savedKeyRef.current = nextKey;
      setSaveState("saved");
    } catch (error) {
      queuedDraftRef.current = nextDraft;
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Could not autosave changes.");
    } finally {
      savingRef.current = false;
      if (queuedDraftRef.current) {
        saveTimerRef.current = setTimeout(() => {
          void flushAutosave();
        }, 400);
      } else if (closeAfterSaveRef.current) {
        router.push(closeHref);
      }
    }
  }, [archived, closeHref, request.id, router]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const queueDraft = useCallback((nextDraft: DraftValues, immediate = false) => {
    if (archived) return;
    queuedDraftRef.current = nextDraft;
    setSaveState("dirty");
    setSaveError(null);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void flushAutosave();
    }, immediate ? 120 : 900);
  }, [archived, flushAutosave]);

  function updateField<Key extends keyof DraftValues>(field: Key, value: DraftValues[Key], immediate = false) {
    setDraft((current) => {
      const nextDraft = { ...current, [field]: value };
      queueDraft(nextDraft, immediate);
      return nextDraft;
    });
  }

  const handleClose = useCallback(async () => {
    if (!archived) {
      if (!savingRef.current && !queuedDraftRef.current && draftKey(draft) === savedKeyRef.current) {
        router.push(closeHref);
        return;
      }
      closeAfterSaveRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      queuedDraftRef.current = draft;
      await flushAutosave();
      if (savingRef.current || queuedDraftRef.current || closeAfterSaveRef.current) return;
    }
    router.push(closeHref);
  }, [archived, closeHref, draft, flushAutosave, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void handleClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  const saveLabel = archived
    ? null
    : ({
      ready: "Autosave ready",
      dirty: "Unsaved changes",
      saving: "Saving...",
      saved: "Saved",
      error: "Could not autosave",
    } satisfies Record<SaveState, string>)[saveState];

  function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextBody = commentBody.trim();
    if (!nextBody || archived) return;

    startCommentTransition(async () => {
      setCommentError(null);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      queuedDraftRef.current = draft;
      await flushAutosave();
      if (savingRef.current || queuedDraftRef.current) return;

      try {
        const formData = new FormData();
        formData.set("request_id", request.id);
        formData.set("body", nextBody);
        await addCreativeRequestComment(formData);
        setCommentBody("");
        router.refresh();
      } catch (error) {
        setCommentError(error instanceof Error ? error.message : "Could not post comment.");
      }
    });
  }

  function handleGenerateBrief() {
    if (!canGenerateBrief) return;

    startBriefTransition(async () => {
      setBriefError(null);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      queuedDraftRef.current = draft;
      await flushAutosave();
      if (savingRef.current || queuedDraftRef.current) return;

      try {
        const formData = new FormData();
        formData.set("request_id", request.id);
        await generateCreativeBrief(formData);
        router.refresh();
      } catch (error) {
        setBriefError(error instanceof Error ? error.message : "Could not generate creative brief.");
      }
    });
  }

  function downloadImage(filename: string, dataUrl: string) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }

  function handleGenerateImages() {
    if (!canGenerateImages) return;

    startImageTransition(async () => {
      setImageError(null);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      queuedDraftRef.current = draft;
      await flushAutosave();
      if (savingRef.current || queuedDraftRef.current) return;

      try {
        const formData = new FormData();
        formData.set("request_id", request.id);
        formData.set("count", draft.assets_needed);
        formData.set("size", imageSize);
        formData.set("quality", imageQuality);
        const result = await generateCreativeImages(formData);
        setGeneratedImages(result.images);
        setImagePrompt(result.prompt);
      } catch (error) {
        setImageError(error instanceof Error ? error.message : "Could not generate images.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-zinc-950/40 p-0 backdrop-blur-[1px] sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close creative request"
        className="absolute inset-0"
        onClick={() => void handleClose()}
      />
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-2xl sm:border">
        <div className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-violet-700">
              <span className="inline-flex items-center gap-1.5">
                <Palette className="size-3.5" />
                #{request.order_number}
              </span>
              <span className="text-zinc-400">·</span>
              <span className="text-zinc-500">{request.clients?.name}</span>
              {archived && <span className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-zinc-500">Archived</span>}
            </div>
            <h2 className="mt-2 text-lg font-medium text-zinc-950 sm:text-xl">{draft.title || request.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <StatusPill value={draft.status} />
              <span className={`inline-flex items-center gap-1.5 border px-2 py-1 ${creativeDateTone(draft.due_date, draft.status, timezone) || "border-zinc-200 text-zinc-600"}`}>
                <CalendarDays className="size-3.5" />
                {draft.due_date}
              </span>
              <span className="border border-zinc-200 px-2 py-1 text-zinc-600">
                {draft.assets_needed} {draft.assets_needed === "1" ? "creative" : "creatives"}
              </span>
              {creatorName && <span>{creatorName}</span>}
              {personaName && <span className="text-violet-700">ICP: {personaName}</span>}
              {request.completed_drive_folder_url && (
                <a
                  href={request.completed_drive_folder_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-700 transition hover:bg-emerald-100"
                >
                  Content link
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleClose()}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border text-zinc-500 transition hover:text-zinc-950"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {archived ? (
            <div className="space-y-5 text-sm text-zinc-600">
              {sourceTask && taskHref(sourceTask) && (
                <Link href={taskHref(sourceTask) ?? "#"} className="inline-flex items-center gap-1.5 text-xs text-blue-700 underline">
                  Linked task: {sourceTask.title}
                  <ExternalLink className="size-3" />
                </Link>
              )}
              <div><p className="ui-kicker mb-1">Direction</p><p className="whitespace-pre-wrap">{request.hypothesis}</p></div>
              <div><p className="ui-kicker mb-1">Brief</p><p className="whitespace-pre-wrap">{request.brief || "—"}</p></div>
              <div><p className="ui-kicker mb-1">Notes</p><p className="whitespace-pre-wrap">{request.notes || "—"}</p></div>
              {request.references_url && <a href={request.references_url} target="_blank" rel="noreferrer" className="block break-all underline">Open references</a>}
              {request.completed_drive_folder_url && (
                <a href={request.completed_drive_folder_url} target="_blank" rel="noreferrer" className="block break-all text-emerald-700 underline">
                  Open submitted delivery folder
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-sm font-medium md:col-span-2">
                  Request title
                  <input
                    value={draft.title}
                    onChange={(event) => updateField("title", event.currentTarget.value)}
                    onBlur={() => queueDraft(draft, true)}
                    className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm font-medium">
                  Creator
                  <select
                    value={draft.creator_id}
                    onChange={(event) => updateField("creator_id", event.currentTarget.value, true)}
                    className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {creators.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active === false ? " (inactive)" : ""}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  ICP
                  <select
                    value={draft.persona_id}
                    onChange={(event) => updateField("persona_id", event.currentTarget.value, true)}
                    className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="">Select ICP</option>
                    {availablePersonas.map((persona) => (
                      <option key={persona.id} value={persona.id}>
                        {persona.name}{persona.segment ? ` · ${persona.segment}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Status
                  <select
                    value={draft.status}
                    onChange={(event) => updateField("status", event.currentTarget.value, true)}
                    className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    {CREATIVE_STATUSES.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Due
                  <input
                    type="date"
                    value={draft.due_date}
                    onChange={(event) => updateField("due_date", event.currentTarget.value, true)}
                    className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm font-medium">
                  Creative count
                  <input
                    type="number"
                    min="1"
                    max={MAX_GENERATED_CREATIVE_IMAGES}
                    value={draft.assets_needed}
                    onChange={(event) => updateField("assets_needed", normalizeCreativeCountValue(event.currentTarget.value), true)}
                    className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm font-medium md:col-span-2 xl:col-span-3">
                  References URL
                  <input
                    type="url"
                    value={draft.references_url}
                    onChange={(event) => updateField("references_url", event.currentTarget.value)}
                    onBlur={() => queueDraft(draft, true)}
                    className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </label>
                {sourceTask && taskHref(sourceTask) && (
                  <div className="border border-blue-200 bg-blue-50 px-4 py-3 text-sm md:col-span-2 xl:col-span-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-700">Linked task</p>
                    <Link href={taskHref(sourceTask) ?? "#"} className="mt-1 inline-flex items-center gap-1.5 text-blue-700 underline">
                      {sourceTask.title}
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                )}
                <label className="text-sm font-medium md:col-span-2 xl:col-span-4">
                  Direction
                  <textarea
                    rows={3}
                    value={draft.hypothesis}
                    onChange={(event) => updateField("hypothesis", event.currentTarget.value)}
                    onBlur={() => queueDraft(draft, true)}
                    className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm font-medium md:col-span-2 xl:col-span-2">
                  <span className="flex flex-wrap items-center justify-between gap-3">
                    <span>Brief</span>
                    <button
                      type="button"
                      onClick={handleGenerateBrief}
                      disabled={!canGenerateBrief || briefPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {briefPending ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                      {briefPending ? "Working" : request.brief_generated_at ? "Regenerate AI brief" : "Generate AI brief"}
                    </button>
                  </span>
                  <textarea
                    rows={7}
                    value={draft.brief}
                    onChange={(event) => updateField("brief", event.currentTarget.value)}
                    onBlur={() => queueDraft(draft, true)}
                    className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                  />
                  <span className="mt-1.5 block text-xs text-zinc-500">
                    {!canManageCreativeAi
                      ? "Only owners and admins can generate AI briefs."
                      : !aiBriefEnabled
                      ? "Enable OpenAI in Settings before generating briefs."
                      : !draft.persona_id
                        ? "Select an ICP first. One clear paragraph about who they are and what they want is enough to start."
                        : "AI uses the request, linked task, selected ICP summary, and client dossier to draft this brief."}
                  </span>
                  {briefError && <span className="mt-1.5 block text-xs text-red-600">{briefError}</span>}
                </label>
                <label className="text-sm font-medium md:col-span-2 xl:col-span-2">
                  Notes
                  <textarea
                    rows={7}
                    value={draft.notes}
                    onChange={(event) => updateField("notes", event.currentTarget.value)}
                    onBlur={() => queueDraft(draft, true)}
                    className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </label>
                <div className="rounded-xl border bg-zinc-50/60 p-4 text-sm md:col-span-2 xl:col-span-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Test creatives</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Generate temporary image concepts from the current brief. They stay in the browser until you download them.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateImages}
                      disabled={!canGenerateImages || imagePending}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {imagePending ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                      {imagePending ? "Working" : `Generate ${draft.assets_needed} image${draft.assets_needed === "1" ? "" : "s"}`}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <label className="text-sm font-medium">
                      Size
                      <select
                        value={imageSize}
                        onChange={(event) => setImageSize(event.currentTarget.value as "1024x1024" | "1024x1536" | "1536x1024")}
                        className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      >
                        <option value="1024x1536">Portrait</option>
                        <option value="1024x1024">Square</option>
                        <option value="1536x1024">Landscape</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium">
                      Quality
                      <select
                        value={imageQuality}
                        onChange={(event) => setImageQuality(event.currentTarget.value as "low" | "medium" | "high")}
                        className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <div className="text-xs text-zinc-500">
                      <p className="font-medium text-zinc-700">Model</p>
                      <p className="mt-1">
                        {aiUsesServerKey
                          ? `Current model: ${aiImageModel}. Add a stored agency OpenAI key in Settings to enable image generation.`
                          : `Uses ${aiImageModel} through the agency OpenAI key.`}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    {!canManageCreativeAi
                      ? "Only owners and admins can generate AI images."
                      : !aiBriefEnabled
                      ? "Enable OpenAI in Settings before generating images."
                      : aiUsesServerKey
                        ? "Store an agency OpenAI key in Settings before generating images. The shared fallback key is disabled here."
                      : !draft.brief.trim()
                        ? "Generate or write a brief first so the image direction is specific."
                        : "Best for reference concepts, early testing, or creator direction. Images are not stored in the database."}
                  </p>
                  {imageError && <p className="mt-2 text-xs text-red-600">{imageError}</p>}
                  {imagePrompt && (
                    <details className="mt-4 rounded-lg border bg-white">
                      <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                        Prompt used
                      </summary>
                      <pre className="overflow-x-auto whitespace-pre-wrap border-t px-3 py-3 text-xs text-zinc-600">{imagePrompt}</pre>
                    </details>
                  )}
                  {!!generatedImages.length && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {generatedImages.map((image) => (
                        <div key={image.filename} className="overflow-hidden rounded-xl border bg-white">
                          <Image
                            src={image.dataUrl}
                            alt={image.filename}
                            width={imageDimensions(image.size).width}
                            height={imageDimensions(image.size).height}
                            unoptimized
                            className="h-auto w-full bg-zinc-100 object-cover"
                          />
                          <div className="space-y-2 border-t p-3">
                            <button
                              type="button"
                              onClick={() => downloadImage(image.filename, image.dataUrl)}
                              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-zinc-700"
                            >
                              <Download className="size-3.5" />
                              Download
                            </button>
                            {image.revisedPrompt && (
                              <details className="rounded-lg border bg-zinc-50">
                                <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                                  Revised prompt
                                </summary>
                                <p className="border-t px-2 py-2 text-xs text-zinc-600">{image.revisedPrompt}</p>
                              </details>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 border-t pt-6">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Comments</p>
              {!comments.length ? (
                <p className="mt-3 text-sm text-zinc-500">No comments yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`rounded-xl border px-3 py-2 text-sm ${comment.author_type === "creator" ? "border-violet-200 bg-violet-50/60" : "border-zinc-200 bg-zinc-50"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.08em]">
                        <span className={comment.author_type === "creator" ? "text-violet-700" : "text-zinc-600"}>{comment.author_name}</span>
                        <span className="text-zinc-400">{formatDateTime(comment.created_at, timezone)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-zinc-700">{comment.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {!archived && (
                <form onSubmit={submitComment} className="mt-4 space-y-3 border-t pt-4">
                  <label className="block text-sm font-medium">
                    Reply to creator
                    <textarea
                      rows={4}
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.currentTarget.value)}
                      disabled={commentPending}
                      className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-zinc-50"
                    />
                  </label>
                  {commentError ? <p className="text-sm text-red-600">{commentError}</p> : null}
                  <button
                    type="submit"
                    disabled={commentPending || !commentBody.trim()}
                    className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {commentPending ? "Posting..." : "Post comment"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t px-4 py-4 sm:px-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500" aria-live="polite" title={saveError ?? undefined}>
            {saveLabel}
            {saveState === "error" && saveError ? <span className="ml-2 normal-case tracking-normal text-red-600">{saveError}</span> : null}
          </div>
          {archived ? (
            <form action={restoreCreativeRequest}>
              <input type="hidden" name="request_id" value={request.id} />
              <button className="ui-action-ghost flex items-center gap-1.5 text-emerald-700">
                <Undo2 className="size-3.5" />
                Restore request
              </button>
            </form>
          ) : (
            <form action={archiveCreativeRequest}>
              <input type="hidden" name="request_id" value={request.id} />
              <button className="ui-action-ghost ui-action-ghost-destructive flex items-center gap-1.5 text-zinc-500">
                <Archive className="size-3.5" />
                Archive request
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
