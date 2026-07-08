import { requireClient } from "@/lib/auth";
import { buildCsvLine, TASK_IMPORT_COLUMNS } from "@/lib/task-csv";

function sanitizeFilePart(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "client";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  const context = await requireClient(clientId);

  const { data: members, error } = await context.supabase
    .from("agency_members")
    .select("display_name, email")
    .eq("agency_id", context.agency.id)
    .order("display_name");
  if (error) throw new Error(error.message);

  const lines = [
    "# Agency CRM task import template",
    "# Use assignee_email exactly as shown below.",
    "# Blank list_name imports into the currently selected non-recurring list, or General if Recurring is selected.",
    "# Required columns: task_key, title",
    "# start_date and due_date must use YYYY-MM-DD. Leave blank if not needed.",
    "# For task checklists inside description, use Markdown checklist lines such as:",
    "# - [ ] First step",
    "# - [ ] Second step",
    "# - [x] Completed step",
    "# Parent-child links must stay inside the same list.",
    "#",
    "# Current team members:",
    ...((members ?? []).map((member) => {
      const label = member.display_name?.trim() || member.email?.trim() || "Unnamed member";
      const email = member.email?.trim();
      return email ? `# - ${label} <${email}>` : `# - ${label} (no email saved)`;
    })),
    buildCsvLine(TASK_IMPORT_COLUMNS),
    buildCsvLine([
      "Launch",
      "launch-01",
      "",
      "Kickoff and scope lock",
      "Confirm goals, deliverables, access, timeline, and owners.\n\nChecklist:\n- [ ] Confirm success metric\n- [ ] Confirm owners\n- [ ] Confirm launch date",
      "todo",
      "high",
      members?.[0]?.email ?? "",
      "2026-07-10",
      "2026-07-11",
    ]),
    buildCsvLine([
      "Launch",
      "launch-02",
      "",
      "Tracking foundation",
      "Set up analytics, pixels, conversions, and naming rules.",
      "todo",
      "high",
      members?.[1]?.email ?? members?.[0]?.email ?? "",
      "2026-07-11",
      "2026-07-14",
    ]),
    buildCsvLine([
      "Launch",
      "launch-02-a",
      "launch-02",
      "Tracking QA",
      "Verify every event and conversion fires correctly before launch.",
      "todo",
      "normal",
      members?.[1]?.email ?? members?.[0]?.email ?? "",
      "2026-07-14",
      "2026-07-15",
    ]),
  ];

  const csv = `${lines.join("\n")}\n`;
  const filename = `${sanitizeFilePart(context.client.name)}-task-import-template.csv`;

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
