export const TASK_IMPORT_COLUMNS = [
  "list_name",
  "task_key",
  "parent_task_key",
  "title",
  "description",
  "status",
  "priority",
  "assignee_email",
  "start_date",
  "due_date",
] as const;

export type TaskImportColumn = (typeof TASK_IMPORT_COLUMNS)[number];

export function normalizeCsvHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function isBlankCsvRow(row: string[]) {
  return row.every((cell) => cell.trim() === "");
}

export function isCsvCommentRow(row: string[]) {
  const populatedCells = row
    .map((cell) => cell.trim())
    .filter(Boolean);

  return populatedCells.length === 1 && populatedCells[0].startsWith("#");
}

export function escapeCsvCell(value: string | null | undefined) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export function buildCsvLine(values: ReadonlyArray<string | null | undefined>) {
  return values.map((value) => escapeCsvCell(value)).join(",");
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          currentCell += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }

      currentCell += char;
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (char === "\r" || char === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";

      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }

    currentCell += char;
  }

  if (inQuotes) {
    throw new Error("CSV contains an unterminated quoted field.");
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}
