export type ChecklistLine = {
  checked: boolean;
  indent: string;
  text: string;
};

const CHECKED_MARKS = new Set(["x", "✓", "✔", "☑", "✅", "☒"]);

function normalizeChecklistWhitespace(line: string) {
  return line
    .replace(/\r/g, "")
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/\u200B/g, "");
}

export function parseChecklistLine(line: string): ChecklistLine | null {
  const normalizedLine = normalizeChecklistWhitespace(line);

  const markdown = normalizedLine.match(/^(\s*)(?:(?:[-*+•])|\d+\.)?\s*\[\s*([xX✓✔☑✅☒]?)\s*\]\s*(.*)$/u);
  if (markdown) {
    const marker = markdown[2].toLowerCase();
    return {
      checked: CHECKED_MARKS.has(marker),
      indent: markdown[1],
      text: markdown[3],
    };
  }

  const unicode = normalizedLine.match(/^(\s*)(☐|☑|✅|☒)\s*(.*)$/u);
  if (!unicode) return null;

  return {
    checked: unicode[2] !== "☐",
    indent: unicode[1],
    text: unicode[3],
  };
}

export function checklistMarkdown(checklist: ChecklistLine) {
  return `${checklist.indent}- [${checklist.checked ? "x" : " "}] ${checklist.text}`;
}

export function normalizeTaskDescription(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const checklist = parseChecklistLine(line);
      return checklist ? checklistMarkdown(checklist) : line;
    })
    .join("\n");
}

export function normalizeNullableTaskDescription(value: string | null | undefined) {
  if (value == null) return null;
  return normalizeTaskDescription(value);
}
