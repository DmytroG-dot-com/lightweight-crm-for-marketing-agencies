export function DossierExportButton({
  clientId,
}: {
  clientId: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-y bg-white px-4 py-4">
      <div>
        <h2 className="ui-section-title">Client context export</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
          Download the current dossier and ICPs as Markdown for external AI agents, prompt docs, or internal knowledge handoff.
        </p>
      </div>
      <a href={`/clients/${clientId}/dossier-export`} className="ui-action">
        Download dossier (.md)
      </a>
    </div>
  );
}
