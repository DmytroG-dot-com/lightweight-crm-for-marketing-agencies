"use client";

import { Paperclip, ScreenShare, Square, X } from "lucide-react";
import { useRef, useState } from "react";
import { addTaskComment } from "@/actions/crm";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export function CommentComposer({
  agencyId,
  clientId,
  taskId,
}: {
  agencyId: string;
  clientId: string;
  taskId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function addFiles(nextFiles: File[]) {
    const accepted = nextFiles.filter((file) => file.size <= MAX_FILE_SIZE);
    if (accepted.length !== nextFiles.length) setError("Each attachment must be 100 MB or smaller.");
    setFiles((current) => [...current, ...accepted].slice(0, 10));
  }

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamRef.current = stream;
      const chunks: Blob[] = [];
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "video/webm";
        const blob = new Blob(chunks, { type });
        addFiles([new File([blob], `screen-recording-${Date.now()}.webm`, { type })]);
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
      };
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state !== "inactive") recorder.stop();
      });
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError("Screen recording was cancelled or is not supported by this browser.");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
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
      formData.set("attachments", JSON.stringify(attachments));
      await addTaskComment(formData);
      formRef.current?.reset();
      setFiles([]);
    } catch (submitError) {
      if (uploadedPaths.length) await supabase.storage.from("comment-attachments").remove(uploadedPaths);
      setError(submitError instanceof Error ? submitError.message : "Unable to add comment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} action={submit} className="mt-3 space-y-3">
      <textarea name="body" rows={2} placeholder="Add a comment" className="w-full rounded-lg border bg-white px-3 py-2 text-sm" />
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
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-medium">
          <Paperclip className="size-3.5" />
          Attach files
          <input type="file" multiple className="hidden" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
        </label>
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${recording ? "border-red-200 bg-red-50 text-red-700" : "bg-white"}`}
        >
          {recording ? <Square className="size-3.5" /> : <ScreenShare className="size-3.5" />}
          {recording ? "Stop recording" : "Record screen"}
        </button>
        <button disabled={pending || recording} className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
          {pending ? "Uploading..." : "Add comment"}
        </button>
      </div>
    </form>
  );
}
