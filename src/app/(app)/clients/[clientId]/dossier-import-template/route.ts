import { requireClient } from "@/lib/auth";
import { buildDossierImportCsv } from "@/lib/dossier-csv";

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
  const { data: dossier, error } = await context.supabase
    .from("dossiers")
    .select("*")
    .eq("agency_id", context.agency.id)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const csv = buildDossierImportCsv(dossier as Record<string, unknown> | null);
  const filename = `${sanitizeFilePart(context.client.name)}-dossier-import.csv`;
  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
