"use client";

import { Bold, CheckSquare, Link2, List, Pencil, Type } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

type ChecklistLine = {
  checked: boolean;
  indent: string;
  text: string;
};

function parseChecklistLine(line: string): ChecklistLine | null {
  const markdown = line.match(/^(\s*)(?:[-*+]\s*)?\[([ xX✓]?)\]\s*(.*)$/);
  if (markdown) {
    return {
      checked: ["x", "✓"].includes(markdown[2].toLowerCase()),
      indent: markdown[1],
      text: markdown[3],
    };
  }

  const unicode = line.match(/^(\s*)(☐|☑|✅)\s*(.*)$/);
  if (!unicode) return null;
  return {
    checked: unicode[2] !== "☐",
    indent: unicode[1],
    text: unicode[3],
  };
}

function checklistMarkdown(checklist: ChecklistLine) {
  return `${checklist.indent}- [${checklist.checked ? "x" : " "}] ${checklist.text}`;
}

function normalizeChecklists(value: string) {
  return value
    .split("\n")
    .map((line) => {
      const checklist = parseChecklistLine(line);
      return checklist ? checklistMarkdown(checklist) : line;
    })
    .join("\n");
}

export function TaskDescriptionEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [source, setSource] = useState(value);
  const [editing, setEditing] = useState(!value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousValueRef = useRef(value);

  useEffect(() => {
    const previousValue = previousValueRef.current;
    previousValueRef.current = value;

    const hasUnsavedLocalChanges = source !== previousValue;
    if (hasUnsavedLocalChanges) return;

    setSource(value);
    if (editing && !previousValue.trim() && value.trim()) {
      setEditing(false);
    }
  }, [editing, source, value]);

  function insert(before: string, after = "", fallback = "text") {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = source.slice(start, end) || fallback;
    const next = `${source.slice(0, start)}${before}${selected}${after}${source.slice(end)}`;
    setSource(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function saveAndClose() {
    const normalized = normalizeChecklists(source);
    setSource(normalized);
    onSave(normalized);
    setEditing(false);
  }

  function toggleChecklist(lineIndex: number) {
    const lines = source.split("\n");
    const checklist = parseChecklistLine(lines[lineIndex]);
    if (!checklist) return;
    lines[lineIndex] = checklistMarkdown({ ...checklist, checked: !checklist.checked });
    const next = lines.join("\n");
    setSource(next);
    onSave(next);
  }

  function insertChecklist() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = source.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextLineBreak = source.indexOf("\n", end);
    const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak;
    const selection = source.slice(lineStart, lineEnd);
    const nextSelection = selection
      .split("\n")
      .map((line) => {
        const checklist = parseChecklistLine(line);
        if (checklist) return checklistMarkdown(checklist);
        const indent = line.match(/^\s*/)?.[0] ?? "";
        const text = line.trim().replace(/^[-*+]\s+/, "") || "Checklist item";
        return `${indent}- [ ] ${text}`;
      })
      .join("\n");
    const next = `${source.slice(0, lineStart)}${nextSelection}${source.slice(lineEnd)}`;
    setSource(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart, lineStart + nextSelection.length);
    });
  }

  function continueChecklist(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    const textarea = event.currentTarget;
    const cursor = textarea.selectionStart;
    if (cursor !== textarea.selectionEnd) return;
    const lineStart = source.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
    const checklist = parseChecklistLine(source.slice(lineStart, cursor));
    if (!checklist) return;
    event.preventDefault();
    const prefix = `\n${checklist.indent}- [ ] `;
    const next = `${source.slice(0, cursor)}${prefix}${source.slice(cursor)}`;
    const nextCursor = cursor + prefix.length;
    setSource(next);
    requestAnimationFrame(() => textarea.setSelectionRange(nextCursor, nextCursor));
  }

  if (!editing) {
    return (
      <div className="group relative min-h-36 border border-zinc-200 bg-zinc-50 px-4 py-4">
        <button type="button" onClick={() => setEditing(true)} className="absolute right-3 top-3 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-blue-700">
          <Pencil className="size-3" />Edit
        </button>
        <DescriptionView source={source} onToggleChecklist={toggleChecklist} />
      </div>
    );
  }

  return (
    <div className="border border-blue-300 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-zinc-50 px-2 py-2">
        <FormatButton label="Bold" onClick={() => insert("**", "**")}><Bold /></FormatButton>
        <FormatButton label="Heading" onClick={() => insert("## ", "", "Heading")}><Type /></FormatButton>
        <FormatButton label="Checklist" onClick={insertChecklist}><CheckSquare /></FormatButton>
        <FormatButton label="Bullet list" onClick={() => insert("- ", "", "List item")}><List /></FormatButton>
        <FormatButton label="Link" onClick={() => insert("[", "](https://)", "link text")}><Link2 /></FormatButton>
        <span className="ml-auto text-[9px] uppercase tracking-[0.08em] text-zinc-400">Markdown formatting</span>
      </div>
      <textarea
        ref={textareaRef}
        value={source}
        onChange={(event) => setSource(event.currentTarget.value)}
        onKeyDown={continueChecklist}
        placeholder="Add a description, URL, or - [ ] checklist item..."
        className="min-h-64 w-full resize-none border-0 bg-white px-4 py-4 text-sm leading-7 [field-sizing:content]"
        autoFocus
      />
      <div className="flex justify-end gap-2 border-t border-zinc-200 px-3 py-2">
        <button type="button" onClick={() => { setSource(value); setEditing(false); }} className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-400 hover:text-zinc-950">Cancel</button>
        <button type="button" onClick={saveAndClose} className="text-[9px] font-semibold uppercase tracking-[0.1em] text-blue-700 hover:text-blue-900">Done</button>
      </div>
    </div>
  );
}

function FormatButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactElement }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="grid size-7 place-items-center text-zinc-400 hover:bg-white hover:text-blue-700 [&>svg]:size-3.5">
      {children}
    </button>
  );
}

function DescriptionView({ source, onToggleChecklist }: { source: string; onToggleChecklist: (lineIndex: number) => void }) {
  if (!source.trim()) return <p className="text-sm text-zinc-400">Add a description, links, or checklist items.</p>;
  return (
    <div className="space-y-2 pr-14 text-sm leading-6 text-zinc-700">
      {source.split("\n").map((line, index) => {
        const checklist = parseChecklistLine(line);
        if (checklist) {
          return (
            <label key={index} className="flex cursor-pointer items-start gap-2 text-sm font-normal normal-case tracking-normal">
              <input type="checkbox" checked={checklist.checked} onChange={() => onToggleChecklist(index)} className="mt-1 size-4 accent-blue-600" />
              <span className={checklist.checked ? "text-zinc-400 line-through" : ""}>{renderInline(checklist.text)}</span>
            </label>
          );
        }
        if (line.startsWith("## ")) return <h3 key={index} className="pt-2 text-base font-semibold text-zinc-950">{renderInline(line.slice(3))}</h3>;
        if (/^\s*-\s+/.test(line)) return <p key={index} className="flex gap-2 before:content-['•']">{renderInline(line.replace(/^\s*-\s+/, ""))}</p>;
        if (/^\s*\d+\.\s+/.test(line)) return <p key={index} className="pl-1">{renderInline(line)}</p>;
        return line ? <p key={index}>{renderInline(line)}</p> : <div key={index} className="h-2" />;
      })}
    </div>
  );
}

function renderInline(value: string) {
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s]+|\*\*[^*]+\*\*|`[^`]+`)/g;
  return value.split(pattern).filter(Boolean).map((part, index) => {
    const markdownLink = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (markdownLink) return <a key={index} href={markdownLink[2]} target="_blank" rel="noreferrer" className="text-blue-700 underline underline-offset-2">{markdownLink[1]}</a>;
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noreferrer" className="break-all text-blue-700 underline underline-offset-2">{part}</a>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index} className="font-semibold text-zinc-950">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="bg-zinc-200 px-1 py-0.5 text-xs">{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}
