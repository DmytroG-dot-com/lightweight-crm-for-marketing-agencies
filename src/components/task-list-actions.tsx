"use client";

import { Archive, MoreHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveTaskList, deleteTaskList } from "@/actions/crm";

type ActionKind = "archive" | "delete";

const actionCopy: Record<ActionKind, { title: string; description: string; confirm: string }> = {
  archive: {
    title: "Archive list?",
    description: "This removes the list from active view and archives every task in it. Use this when the list is no longer active work.",
    confirm: "Archive list",
  },
  delete: {
    title: "Delete empty list?",
    description: "This permanently removes the list record. Only empty custom lists can be deleted.",
    confirm: "Delete list",
  },
};

export function TaskListActions({
  clientId,
  listId,
}: {
  clientId: string;
  listId: string;
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState<ActionKind | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, [menuOpen]);

  function submit(kind: ActionKind) {
    const formData = new FormData();
    formData.set("client_id", clientId);
    formData.set("list_id", listId);
    setError("");

    startTransition(async () => {
      try {
        const result = await (kind === "archive" ? archiveTaskList(formData) : deleteTaskList(formData));
        setConfirming(null);
        setMenuOpen(false);
        router.push(result.redirectTo);
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not update list.");
      }
    });
  }

  return (
    <>
      <div ref={menuRef} className="relative ml-auto">
        <button
          type="button"
          disabled={pending}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-7 place-items-center text-zinc-300 opacity-60 transition hover:bg-zinc-100 hover:text-zinc-700 hover:opacity-100 disabled:opacity-30"
          aria-label="List actions"
          aria-expanded={menuOpen}
          title="List actions"
        >
          <MoreHorizontal className="size-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-[70] mt-2 w-52 border border-zinc-950 bg-white p-1 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirming("archive");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
            >
              <Archive className="size-3.5" />Archive list
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirming("delete");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-red-500 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-3.5" />Delete empty list
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-zinc-950/55 p-4" onMouseDown={() => !pending && setConfirming(null)}>
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="task-list-action-title"
            className="w-full max-w-md border border-zinc-950 bg-white p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="ui-kicker">{confirming === "delete" ? "Permanent action" : "List action"}</p>
                <h2 id="task-list-action-title" className="mt-2 text-lg font-medium tracking-[-0.03em] text-zinc-950">
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
