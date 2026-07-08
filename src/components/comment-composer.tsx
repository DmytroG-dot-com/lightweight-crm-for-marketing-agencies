"use client";

import { AtSign, Mic, Paperclip, ScreenShare, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { addTaskComment } from "@/actions/crm";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
type RecordingMode = "screen" | "voice";
type Member = { user_id: string; display_name: string | null; email: string | null };
type ActiveMention = { start: number; end: number; query: string };

function memberLabel(member: Member) {
  return member.display_name || member.email || "Member";
}

function activeMentionAt(value: string, cursor: number): ActiveMention | null {
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|[\s(])@([^\s@]*)$/);
  if (!match) return null;
  return {
    start: cursor - match[1].length - 1,
    end: cursor,
    query: match[1],
  };
}

export function CommentComposer({
  agencyId,
  clientId,
  taskId,
  members,
  onCommentAdded,
}: {
  agencyId: string;
  clientId: string;
  taskId: string;
  members: Member[];
  onCommentAdded?: () => void | Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const submitLockRef = useRef(false);
  const requestIdRef = useRef(crypto.randomUUID());
  const [files, setFiles] = useState<File[]>([]);
  const [recordingMode, setRecordingMode] = useState<RecordingMode | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const matchingMembers = activeMention
    ? members.filter((member) => {
      const query = activeMention.query.toLowerCase();
      return memberLabel(member).toLowerCase().includes(query)
        || member.email?.toLowerCase().includes(query);
    }).slice(0, 8)
    : [];

  useEffect(() => () => {
    streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  }, []);

  function addFiles(nextFiles: File[]) {
    const accepted = nextFiles.filter((file) => file.size <= MAX_FILE_SIZE);
    if (accepted.length !== nextFiles.length) setError("Each attachment must be 100 MB or smaller.");
    setFiles((current) => [...current, ...accepted].slice(0, 10));
  }

  function stopStreams() {
    streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    streamsRef.current = [];
  }

  function createRecorder(stream: MediaStream, mode: RecordingMode) {
    const chunks: Blob[] = [];
    const mimeTypes = mode === "screen"
      ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || (mode === "screen" ? "video/webm" : "audio/webm");
      const extension = type.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunks, { type });
      addFiles([new File([blob], `${mode}-recording-${Date.now()}.${extension}`, { type })]);
      stopStreams();
      setRecordingMode(null);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecordingMode(mode);
    return recorder;
  }

  async function startScreenRecording() {
    setError("");
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streamsRef.current = [screenStream];
      const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamsRef.current = [screenStream, microphoneStream];
      const combinedStream = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...microphoneStream.getAudioTracks(),
      ]);
      const recorder = createRecorder(combinedStream, "screen");
      screenStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state !== "inactive") recorder.stop();
      });
    } catch {
      stopStreams();
      setError("Screen and microphone access are required to record a screen video with sound.");
    }
  }

  async function startVoiceRecording() {
    setError("");
    try {
      const microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamsRef.current = [microphoneStream];
      createRecorder(microphoneStream, "voice");
    } catch {
      stopStreams();
      setError("Microphone access is required to record a voice comment.");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
  }

  function updateActiveMention(value: string, cursor: number) {
    setActiveMention(activeMentionAt(value, cursor));
    setActiveMentionIndex(0);
  }

  function insertMention(member: Member) {
    const textarea = textareaRef.current;
    const label = memberLabel(member);
    const mention = `@${label}`;
    if (!textarea || !activeMention) {
      setBody((current) => `${current}${current ? " " : ""}${mention} `);
      return;
    }
    const next = `${body.slice(0, activeMention.start)}${mention} ${body.slice(activeMention.end)}`;
    const cursor = activeMention.start + mention.length + 1;
    setBody(next);
    setActiveMention(null);
    setActiveMentionIndex(0);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function handleCommentKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (activeMention) {
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveMention(null);
        return;
      }
      if (matchingMembers.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveMentionIndex((index) => (index + direction + matchingMembers.length) % matchingMembers.length);
        return;
      }
      if (matchingMembers.length && (event.key === "Enter" || event.key === "Tab")) {
        event.preventDefault();
        insertMention(matchingMembers[activeMentionIndex] ?? matchingMembers[0]);
        return;
      }
    }

    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      !event.nativeEvent.isComposing &&
      !pending &&
      !recordingMode
    ) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    const supabase = createClient();
    const uploadedPaths: string[] = [];
    try {
      const attachments = [];
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `${agencyId}/${taskId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("comment-attachments")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
        attachments.push({
          storage_path: path,
          file_name: file.name,
          content_type: file.type || null,
          size_bytes: file.size,
        });
      }
      formData.set("client_id", clientId);
      formData.set("task_id", taskId);
      formData.set("client_request_id", requestIdRef.current);
      formData.set("attachments", JSON.stringify(attachments));
      await addTaskComment(formData);
      await onCommentAdded?.();
      formRef.current?.reset();
      setBody("");
      setActiveMention(null);
      setFiles([]);
      requestIdRef.current = crypto.randomUUID();
    } catch (submitError) {
      if (uploadedPaths.length) await supabase.storage.from("comment-attachments").remove(uploadedPaths);
      setError(submitError instanceof Error ? submitError.message : "Unable to add comment.");
    } finally {
      setPending(false);
      submitLockRef.current = false;
    }
  }

  return (
    <form
      ref={formRef}
      action={submit}
      onSubmit={(event) => {
        if (submitLockRef.current) {
          event.preventDefault();
          return;
        }
        submitLockRef.current = true;
      }}
      className="mt-3 space-y-3"
    >
      <div className="relative">
        <textarea
          ref={textareaRef}
          name="body"
          rows={2}
          value={body}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setBody(next);
            updateActiveMention(next, event.currentTarget.selectionStart);
          }}
          onClick={(event) => updateActiveMention(body, event.currentTarget.selectionStart)}
          onKeyDown={handleCommentKeyDown}
          placeholder="Add a comment or mention someone with @"
          aria-autocomplete="list"
          aria-controls={activeMention ? `mention-options-${taskId}` : undefined}
          className="w-full border-x-0 border-b border-t-0 bg-white px-0 py-3 text-sm"
        />
        {activeMention && (
          <div
            id={`mention-options-${taskId}`}
            role="listbox"
            className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-[min(14rem,40vh)] overflow-y-auto border border-zinc-950 bg-white p-1 shadow-xl sm:right-auto sm:min-w-72"
          >
            <p className="flex items-center gap-1.5 border-b px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              <AtSign className="size-3" />Mention teammate
            </p>
            {matchingMembers.map((member, index) => (
              <button
                key={member.user_id}
                type="button"
                role="option"
                aria-selected={index === activeMentionIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(member)}
                className={`block w-full px-3 py-2 text-left normal-case tracking-normal ${
                  index === activeMentionIndex ? "bg-blue-50 text-blue-700" : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <span className="block text-xs font-medium">{memberLabel(member)}</span>
                {member.display_name && member.email && <span className="mt-0.5 block text-[10px] text-zinc-400">{member.email}</span>}
              </button>
            ))}
            {!matchingMembers.length && (
              <p className="px-3 py-3 text-xs text-zinc-400">No teammate matches &quot;{activeMention.query}&quot;.</p>
            )}
          </div>
        )}
      </div>
      {!!files.length && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <span key={`${file.name}-${index}`} className="flex max-w-full items-center gap-2 rounded-lg border bg-white px-2 py-1 text-xs">
              <span className="truncate">{file.name}</span>
              <button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="ui-action flex cursor-pointer items-center gap-1.5">
          <Paperclip className="size-3.5" />
          Attach files
          <input type="file" multiple className="hidden" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
        </label>
        <button
          type="button"
          disabled={recordingMode === "voice"}
          onClick={recordingMode === "screen" ? stopRecording : startScreenRecording}
          className={`ui-action flex items-center gap-1.5 disabled:opacity-40 ${recordingMode === "screen" ? "border-red-300 text-red-700" : ""}`}
        >
          {recordingMode === "screen" ? <Square className="size-3.5" /> : <ScreenShare className="size-3.5" />}
          {recordingMode === "screen" ? "Stop screen recording" : "Record screen + mic"}
        </button>
        <button
          type="button"
          disabled={recordingMode === "screen"}
          onClick={recordingMode === "voice" ? stopRecording : startVoiceRecording}
          className={`ui-action flex items-center gap-1.5 disabled:opacity-40 ${recordingMode === "voice" ? "border-red-300 text-red-700" : ""}`}
        >
          {recordingMode === "voice" ? <Square className="size-3.5" /> : <Mic className="size-3.5" />}
          {recordingMode === "voice" ? "Stop voice recording" : "Record voice"}
        </button>
        <button disabled={pending || !!recordingMode} className="ui-action ui-action-primary ml-auto disabled:opacity-50">
          {pending ? "Uploading..." : "Add comment"}
        </button>
      </div>
    </form>
  );
}
