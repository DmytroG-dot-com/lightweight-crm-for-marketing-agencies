import { Download } from "lucide-react";
import { DossierCsvImporter } from "@/components/dossier-csv-importer";

export function DossierExportButton({
  clientId,
}: {
  clientId: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-y bg-white px-4 py-4">
      <div>
        <h2 className="ui-section-title">Client context tools</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
          Download a prefilled CSV template to edit and re-import, or export the dossier and ICPs as Markdown for external AI tools.
        </p>
      </div>
      <div className="flex flex-wrap items-start justify-end gap-2">
        <a href={`/clients/${clientId}/dossier-import-template`} className="ui-action">
          <Download className="size-3.5" />
          CSV template
        </a>
        <a href={`/clients/${clientId}/dossier-export`} className="ui-action">
          <Download className="size-3.5" />
          Dossier (.md)
        </a>
        <DossierCsvImporter clientId={clientId} />
      </div>
    </div>
  );
}
