import { requireClient } from "@/lib/auth";
import { buildPersonaImportTemplateCsv } from "@/lib/persona-csv";

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
  const csv = buildPersonaImportTemplateCsv();
  const filename = `${sanitizeFilePart(context.client.name)}-persona-import-template.csv`;

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
