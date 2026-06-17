"use client";

import { Archive, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveClientWorkspace,
  deleteClient,
  restoreClientWorkspace,
} from "@/actions/crm";

type ActionKind = "archive" | "restore" | "delete";

const actionCopy: Record<ActionKind, { title: string; description: string; confirm: string }> = {
  archive: {
    title: "Archive client workspace?",
    description: "Active tasks and lists will be archived, recurring work will pause, and public onboarding links will close. Manually archived or inactive records keep their previous state.",
    confirm: "Archive workspace",
  },
  restore: {
    title: "Restore client workspace?",
    description: "Only work changed by the client archive will return. Manually archived tasks and manually inactive links will stay unchanged.",
    confirm: "Restore workspace",
  },
  delete: {
    title: "Delete client permanently?",
    description: "This permanently removes the client and all related work, history, dossier data, onboarding, creative requests, and attachments. It cannot be undone.",
    confirm: "Delete permanently",
  },
};

export function ClientLifecycleActions({
  clientId,
  archived,
}: {
  clientId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<ActionKind | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(kind: ActionKind) {
    const formData = new FormData();
    formData.set("client_id", clientId);
    setError("");
    startTransition(async () => {
      try {
        if (kind === "archive") await archiveClientWorkspace(formData);
        if (kind === "restore") await restoreClientWorkspace(formData);
        if (kind === "delete") await deleteClient(formData);
        setConfirming(null);
        if (kind === "restore") router.refresh();
        else router.push("/clients");
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not update client.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!archived ? (
          <button
            type="button"
            onClick={() => setConfirming("archive")}
            className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-300 transition hover:text-zinc-700"
          >
            <Archive className="size-3" />Archive workspace
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setConfirming("restore")} className="ui-action ui-action-primary">
              <RotateCcw className="size-3.5" />Restore workspace
            </button>
            <button type="button" onClick={() => setConfirming("delete")} className="ui-action text-red-600">
              <Trash2 className="size-3.5" />Delete permanently
            </button>
          </>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-zinc-950/55 p-4" onMouseDown={() => !pending && setConfirming(null)}>
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="client-action-title"
            className="w-full max-w-md border border-zinc-950 bg-white p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="ui-kicker">{confirming === "delete" ? "Permanent action" : "Client lifecycle"}</p>
                <h2 id="client-action-title" className="mt-2 text-lg font-medium tracking-[-0.03em] text-zinc-950">
                  {actionCopy[confirming].title}
                </h2>
              </div>
              <button type="button" disabled={pending} onClick={() => setConfirming(null)} className="p-1 text-zinc-400 hover:text-zinc-950" aria-label="Cancel">
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-500">{actionCopy[confirming].description}</p>
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-2 border-t border-zinc-200 pt-4">
              <button type="button" disabled={pending} onClick={() => setConfirming(null)} className="ui-action disabled:opacity-50">Cancel</button>
              <button
                type="button"
                disabled={pending}
                onClick={() => submit(confirming)}
                className={`ui-action disabled:opacity-50 ${confirming === "delete" ? "border-red-600 bg-red-600 text-white hover:bg-red-700" : "ui-action-primary"}`}
              >
                {pending ? "Working..." : actionCopy[confirming].confirm}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
