"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireClient } from "@/lib/auth";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { ensureTaskWatchers } from "@/lib/notifications";
import { normalizeNullableTaskDescription } from "@/lib/task-description";
import {
  TASK_IMPORT_COLUMNS,
  isBlankCsvRow,
  isCsvCommentRow,
  normalizeCsvHeader,
  parseCsv,
} from "@/lib/task-csv";

type TaskCsvImportResult =
  | {
    ok: true;
    message: string;
    taskCount: number;
    listCount: number;
    primaryListId: string | null;
  }
  | {
    ok: false;
    error: string;
  };

type ActiveList = {
  id: string;
  name: string;
  kind: "general" | "recurring" | "custom";
  created_at: string;
};

type ImportRow = {
  rowNumber: number;
  listName: string | null;
  listTargetKey: string;
  taskKey: string;
  taskKeyLookup: string;
  parentTaskKey: string | null;
  parentTaskKeyLookup: string | null;
  title: string;
  description: string | null;
  status: (typeof TASK_STATUSES)[number];
  priority: (typeof TASK_PRIORITIES)[number];
  assigneeId: string | null;
  startDate: string | null;
  dueDate: string | null;
};

type PlannedListTarget =
  | {
    key: string;
    name: string;
    existingListId: string;
    created: false;
  }
  | {
    key: string;
    name: string;
    existingListId: null;
    created: true;
  };

const requiredColumns = new Set(["task_key", "title"]);
const taskStatusValues = new Set<string>(TASK_STATUSES);
const taskPriorityValues = new Set<string>(TASK_PRIORITIES);
const dateSchema = z.string().date();

function normalizeImportKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeTaskStatus(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeTaskPriority(value: string) {
  return value.trim().toLowerCase();
}

function parseOptionalDate(value: string, rowNumber: number, field: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = dateSchema.safeParse(trimmed);
  if (!parsed.success) {
    throw new Error(`Row ${rowNumber}: ${field} must use YYYY-MM-DD.`);
  }

  return parsed.data;
}

function parseImportRows(
  csvText: string,
  assigneeIdByEmail: Map<string, string>,
  resolveListTarget: (listName: string | null, rowNumber: number) => PlannedListTarget,
) {
  const parsedRows = parseCsv(csvText).map((cells, index) => ({
    rowNumber: index + 1,
    cells,
  }));

  const headerRow = parsedRows.find(({ cells }) => !isBlankCsvRow(cells) && !isCsvCommentRow(cells));
  if (!headerRow) {
    throw new Error("Could not find a CSV header row.");
  }

  const normalizedHeader = headerRow.cells.map((value) => normalizeCsvHeader(value));
  const headerIndexes = new Map<string, number>();
  normalizedHeader.forEach((column, index) => {
    if (!column) return;
    if (headerIndexes.has(column)) {
      throw new Error(`The CSV header contains "${column}" more than once.`);
    }
    headerIndexes.set(column, index);
  });

  for (const column of requiredColumns) {
    if (!headerIndexes.has(column)) {
      throw new Error(`The CSV header is missing required column "${column}".`);
    }
  }

  const rows = parsedRows
    .filter(({ rowNumber }) => rowNumber > headerRow.rowNumber)
    .filter(({ cells }) => !isBlankCsvRow(cells) && !isCsvCommentRow(cells));

  if (!rows.length) {
    throw new Error("The CSV does not contain any task rows.");
  }

  const importRows: ImportRow[] = [];
  const seenTaskKeys = new Map<string, number>();

  for (const { rowNumber, cells } of rows) {
    if (cells.length > normalizedHeader.length) {
      throw new Error(`Row ${rowNumber}: too many columns. Check for an unquoted comma in the description.`);
    }

    const values = [...cells];
    while (values.length < normalizedHeader.length) {
      values.push("");
    }

    const rowRecord = Object.fromEntries(
      TASK_IMPORT_COLUMNS.map((column) => [
        column,
        headerIndexes.has(column) ? values[headerIndexes.get(column) ?? -1]?.trim() ?? "" : "",
      ]),
    ) as Record<(typeof TASK_IMPORT_COLUMNS)[number], string>;

    const taskKey = rowRecord.task_key.trim();
    if (!taskKey) {
      throw new Error(`Row ${rowNumber}: task_key is required.`);
    }

    const taskKeyLookup = normalizeImportKey(taskKey);
    if (!taskKeyLookup) {
      throw new Error(`Row ${rowNumber}: task_key is required.`);
    }
    if (seenTaskKeys.has(taskKeyLookup)) {
      throw new Error(`Row ${rowNumber}: task_key "${taskKey}" is duplicated (first used on row ${seenTaskKeys.get(taskKeyLookup)}).`);
    }
    seenTaskKeys.set(taskKeyLookup, rowNumber);

    const title = rowRecord.title.trim();
    if (!title) {
      throw new Error(`Row ${rowNumber}: title is required.`);
    }

    const parentTaskKey = rowRecord.parent_task_key.trim() || null;
    const parentTaskKeyLookup = parentTaskKey ? normalizeImportKey(parentTaskKey) : null;
    if (parentTaskKeyLookup && parentTaskKeyLookup === taskKeyLookup) {
      throw new Error(`Row ${rowNumber}: parent_task_key cannot point to the same row.`);
    }

    const normalizedStatus = normalizeTaskStatus(rowRecord.status || "todo");
    if (!taskStatusValues.has(normalizedStatus)) {
      throw new Error(`Row ${rowNumber}: status must be one of ${TASK_STATUSES.join(", ")}.`);
    }

    const normalizedPriority = normalizeTaskPriority(rowRecord.priority || "normal");
    if (!taskPriorityValues.has(normalizedPriority)) {
      throw new Error(`Row ${rowNumber}: priority must be one of ${TASK_PRIORITIES.join(", ")}.`);
    }

    const assigneeEmail = rowRecord.assignee_email.trim().toLowerCase() || null;
    if (assigneeEmail && !assigneeIdByEmail.has(assigneeEmail)) {
      throw new Error(`Row ${rowNumber}: assignee_email "${rowRecord.assignee_email}" does not match a current team member.`);
    }

    const resolvedListTarget = resolveListTarget(rowRecord.list_name.trim() || null, rowNumber);

    importRows.push({
      rowNumber,
      listName: rowRecord.list_name.trim() || null,
      listTargetKey: resolvedListTarget.key,
      taskKey,
      taskKeyLookup,
      parentTaskKey,
      parentTaskKeyLookup,
      title,
      description: normalizeNullableTaskDescription(rowRecord.description.trim() || null),
      status: normalizedStatus as (typeof TASK_STATUSES)[number],
      priority: normalizedPriority as (typeof TASK_PRIORITIES)[number],
      assigneeId: assigneeEmail ? assigneeIdByEmail.get(assigneeEmail) ?? null : null,
      startDate: parseOptionalDate(rowRecord.start_date, rowNumber, "start_date"),
      dueDate: parseOptionalDate(rowRecord.due_date, rowNumber, "due_date"),
    });
  }

  return importRows;
}

export async function importTaskCsv(formData: FormData): Promise<TaskCsvImportResult> {
  const clientId = z.string().uuid().parse(formData.get("client_id"));
  const selectedListIdValue = String(formData.get("task_list_id") ?? "").trim();
  const selectedListId = selectedListIdValue
    ? z.string().uuid().parse(selectedListIdValue)
    : null;
  const fileEntry = formData.get("file");

  if (!(fileEntry instanceof File)) {
    return { ok: false, error: "Choose a CSV file to import." };
  }

  const csvText = await fileEntry.text();
  if (!csvText.trim()) {
    return { ok: false, error: "The CSV file is empty." };
  }

  const context = await requireClient(clientId);
  const [
    { data: lists, error: listsError },
    { data: members, error: membersError },
  ] = await Promise.all([
    context.supabase
      .from("task_lists")
      .select("id, name, kind, created_at")
      .eq("agency_id", context.agency.id)
      .eq("client_id", clientId)
      .is("archived_at", null)
      .order("created_at"),
    context.supabase
      .from("agency_members")
      .select("user_id, display_name, email")
      .eq("agency_id", context.agency.id)
      .order("display_name"),
  ]);
  if (listsError || membersError) {
    throw new Error(listsError?.message || membersError?.message);
  }

  const activeLists = (lists ?? []) as ActiveList[];
  const generalList = activeLists.find((list) => list.kind === "general");
  if (!generalList) {
    throw new Error("General list not found for this client.");
  }

  const selectedList = selectedListId
    ? activeLists.find((list) => list.id === selectedListId) ?? null
    : null;
  const defaultList = selectedList && selectedList.kind !== "recurring"
    ? selectedList
    : generalList;

  const importableLists = activeLists.filter((list) => list.kind !== "recurring");
  const importableListsByName = new Map<string, ActiveList[]>();
  importableLists.forEach((list) => {
    const key = normalizeImportKey(list.name);
    const bucket = importableListsByName.get(key) ?? [];
    bucket.push(list);
    importableListsByName.set(key, bucket);
  });

  const recurringListName = activeLists.find((list) => list.kind === "recurring")?.name ?? "Recurring";
  const assigneeIdByEmail = new Map(
    (members ?? [])
      .filter((member) => member.email)
      .map((member) => [String(member.email).trim().toLowerCase(), member.user_id]),
  );
  const listTargets = new Map<string, PlannedListTarget>();

  const resolveListTarget = (listName: string | null, rowNumber: number): PlannedListTarget => {
    if (!listName) {
      return {
        key: `existing:${defaultList.id}`,
        name: defaultList.name,
        existingListId: defaultList.id,
        created: false,
      };
    }

    const normalizedName = normalizeImportKey(listName);
    if (normalizedName === normalizeImportKey(recurringListName)) {
      throw new Error(`Row ${rowNumber}: the ${recurringListName} list cannot be used for imports.`);
    }

    const existing = importableListsByName.get(normalizedName) ?? [];
    if (existing.length > 1) {
      throw new Error(`Row ${rowNumber}: multiple active lists are already named "${listName}". Rename one before importing into that list.`);
    }

    if (existing.length === 1) {
      return {
        key: `existing:${existing[0].id}`,
        name: existing[0].name,
        existingListId: existing[0].id,
        created: false,
      };
    }

    const cachedTarget = listTargets.get(normalizedName);
    if (cachedTarget) return cachedTarget;

    const target: PlannedListTarget = {
      key: `new:${normalizedName}`,
      name: listName,
      existingListId: null,
      created: true,
    };
    listTargets.set(normalizedName, target);
    return target;
  };

  let importRows: ImportRow[];
  try {
    importRows = parseImportRows(csvText, assigneeIdByEmail, resolveListTarget);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not parse the CSV file.",
    };
  }

  const rowByTaskKey = new Map(importRows.map((row) => [row.taskKeyLookup, row]));
  for (const row of importRows) {
    if (!row.parentTaskKeyLookup) continue;

    const parentRow = rowByTaskKey.get(row.parentTaskKeyLookup);
    if (!parentRow) {
      return {
        ok: false,
        error: `Row ${row.rowNumber}: parent_task_key "${row.parentTaskKey}" does not match any task_key in this file.`,
      };
    }
    if (parentRow.listTargetKey !== row.listTargetKey) {
      return {
        ok: false,
        error: `Row ${row.rowNumber}: parent_task_key "${row.parentTaskKey}" points to a task in a different list.`,
      };
    }
  }

  const listIdByTargetKey = new Map<string, string>();
  const createdListIds: string[] = [];
  const createdListNames: string[] = [];
  const createdTaskIds: string[] = [];

  try {
    for (const target of listTargets.values()) {
      if (!target.created) continue;

      const { data: createdList, error } = await context.supabase
        .from("task_lists")
        .insert({
          agency_id: context.agency.id,
          client_id: clientId,
          name: target.name,
          kind: "custom",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      listIdByTargetKey.set(target.key, createdList.id);
      createdListIds.push(createdList.id);
      createdListNames.push(target.name);
    }

    for (const row of importRows) {
      if (!listIdByTargetKey.has(row.listTargetKey)) {
        const targetListId = row.listTargetKey.startsWith("existing:")
          ? row.listTargetKey.replace(/^existing:/, "")
          : null;
        if (!targetListId) {
          throw new Error(`Row ${row.rowNumber}: destination list could not be resolved.`);
        }
        listIdByTargetKey.set(row.listTargetKey, targetListId);
      }
    }

    const createdTaskIdByKey = new Map<string, string>();
    const pendingRows = [...importRows];

    while (pendingRows.length > 0) {
      let progressMade = false;

      for (let index = 0; index < pendingRows.length; index += 1) {
        const row = pendingRows[index];
        if (row.parentTaskKeyLookup && !createdTaskIdByKey.has(row.parentTaskKeyLookup)) {
          continue;
        }

        const { data: task, error } = await context.supabase
          .from("tasks")
          .insert({
            agency_id: context.agency.id,
            client_id: clientId,
            task_list_id: listIdByTargetKey.get(row.listTargetKey),
            parent_task_id: row.parentTaskKeyLookup ? createdTaskIdByKey.get(row.parentTaskKeyLookup) ?? null : null,
            title: row.title,
            description: row.description,
            status: row.status,
            priority: row.priority,
            assignee_id: row.assigneeId,
            start_date: row.startDate,
            due_date: row.dueDate,
            created_by: context.user.id,
          })
          .select("id")
          .single();
        if (error) throw new Error(`Row ${row.rowNumber}: ${error.message}`);

        await ensureTaskWatchers({
          agencyId: context.agency.id,
          taskId: task.id,
          userIds: [context.user.id],
        });

        createdTaskIds.push(task.id);
        createdTaskIdByKey.set(row.taskKeyLookup, task.id);
        pendingRows.splice(index, 1);
        index -= 1;
        progressMade = true;
      }

      if (!progressMade) {
        const blockedRows = pendingRows.map((row) => row.rowNumber).join(", ");
        throw new Error(`The CSV task tree contains a cycle or unresolved parent chain around rows ${blockedRows}.`);
      }
    }

    const usedListIds = new Set(importRows.map((row) => listIdByTargetKey.get(row.listTargetKey)).filter(Boolean));
    const primaryListId = importRows.length > 0
      ? listIdByTargetKey.get(importRows[0].listTargetKey) ?? null
      : null;

    await logActivity(context.supabase, {
      agencyId: context.agency.id,
      actorId: context.user.id,
      clientId,
      action: "task_import.completed",
      entityType: "task_import",
      metadata: {
        file_name: fileEntry.name || null,
        task_count: createdTaskIds.length,
        list_count: usedListIds.size,
        created_list_count: createdListNames.length,
        created_list_names: createdListNames,
      },
    });

    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/my-work");

    const createdListsSummary = createdListNames.length
      ? ` Created ${createdListNames.length} new list${createdListNames.length === 1 ? "" : "s"}: ${createdListNames.join(", ")}.`
      : "";

    return {
      ok: true,
      message: `Imported ${createdTaskIds.length} task${createdTaskIds.length === 1 ? "" : "s"} into ${usedListIds.size} list${usedListIds.size === 1 ? "" : "s"}.${createdListsSummary}`,
      taskCount: createdTaskIds.length,
      listCount: usedListIds.size,
      primaryListId,
    };
  } catch (error) {
    if (createdTaskIds.length > 0) {
      await context.supabase
        .from("tasks")
        .delete()
        .eq("agency_id", context.agency.id)
        .eq("client_id", clientId)
        .in("id", createdTaskIds);
    }

    if (createdListIds.length > 0) {
      await context.supabase
        .from("task_lists")
        .delete()
        .eq("agency_id", context.agency.id)
        .eq("client_id", clientId)
        .in("id", createdListIds);
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not import the CSV file.",
    };
  }
}
