import { saveDossier } from "@/actions/crm";
import { DOSSIER_LABELS, DOSSIER_SECTIONS } from "@/lib/constants";

export function DossierForm({
  clientId,
  dossier,
}: {
  clientId: string;
  dossier: Record<string, unknown> | null;
}) {
  return (
    <form action={saveDossier} className="space-y-0">
      <input type="hidden" name="client_id" value={clientId} />
      {DOSSIER_SECTIONS.map((section, index) => (
        <details key={section} open={index === 0} className="border-b bg-white first:border-t">
          <summary className="cursor-pointer py-4 text-[11px] font-semibold uppercase tracking-[0.1em]">{DOSSIER_LABELS[section]}</summary>
          <div className="border-t py-5">
            <p className="mb-2 text-xs text-zinc-500">Enter plain notes or valid JSON. Plain notes are stored as a structured notes field.</p>
            <textarea
              name={section}
              rows={7}
              defaultValue={JSON.stringify(dossier?.[section] ?? {}, null, 2)}
              className="w-full rounded-lg border p-3 font-mono text-xs"
            />
          </div>
        </details>
      ))}
      <div className="grid gap-5 border-y bg-white py-6 lg:grid-cols-2">
        <label className="text-sm font-medium">
          Knowledge base
          <textarea name="knowledge_base" rows={8} defaultValue={String(dossier?.knowledge_base ?? "")} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
        </label>
        <label className="text-sm font-medium">
          AI summary
          <textarea name="ai_summary" rows={8} defaultValue={String(dossier?.ai_summary ?? "")} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
        </label>
      </div>
      <button className="ui-action ui-action-primary mt-6">Save dossier</button>
    </form>
  );
}
