import { requireAgency } from "@/lib/auth";
import { buildOnboardingTemplateImportCsv } from "@/lib/onboarding-csv";

function sanitizeFilePart(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "agency";
}

export async function GET() {
  const context = await requireAgency();
  const csv = buildOnboardingTemplateImportCsv();
  const filename = `${sanitizeFilePart(context.agency.name)}-onboarding-import-template.csv`;

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
