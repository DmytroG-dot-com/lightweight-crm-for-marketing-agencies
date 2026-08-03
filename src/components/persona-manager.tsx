import { deleteClientPersona, upsertClientPersona } from "@/actions/creative";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PersonaCsvImporter } from "@/components/persona-csv-importer";
import { listToLines } from "@/lib/personas";
import { formatLabel } from "@/lib/utils";

type Persona = {
  id: string;
  name: string;
  segment: string | null;
  profile_summary: string | null;
  job_to_be_done: string | null;
  pain_points: unknown;
  desired_outcomes: unknown;
  objections: unknown;
  buying_triggers: unknown;
  awareness_stage: string | null;
  tone_preferences: string | null;
  claim_sensitivity: string | null;
  offer_fit: string | null;
  source: string;
  confidence_score: number | null;
  active: boolean;
  is_primary: boolean;
};

function PersonaFields({
  persona,
}: {
  persona?: Persona;
}) {
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-xs leading-5 text-zinc-500">
        Keep this simple. Think: who this person is, what they want, and what is blocking them. Example: business owner or marketing lead, decision maker, wants more qualified demand, frustrated with inconsistent results.
      </p>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-medium">
          ICP name
          <input name="name" required defaultValue={persona?.name ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Business owner" />
        </label>
        <label className="text-sm font-medium">
          Awareness stage
          <input name="awareness_stage" defaultValue={persona?.awareness_stage ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Problem-aware, solution-aware..." />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input name="active" type="checkbox" defaultChecked={persona?.active ?? true} />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input name="is_primary" type="checkbox" defaultChecked={persona?.is_primary ?? false} />
          Primary ICP
        </label>
        <label className="text-sm font-medium md:col-span-2 xl:col-span-4">
          Who this ICP is
          <textarea
            name="profile_summary"
            rows={4}
            defaultValue={persona?.profile_summary ?? ""}
            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Decision maker responsible for growth. Wants more reliable results, cares about ROI, and needs a practical solution that fits the business."
          />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Pain points
          <textarea name="pain_points" rows={5} defaultValue={listToLines(persona?.pain_points)} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" placeholder="One point per line" />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Desired outcomes
          <textarea name="desired_outcomes" rows={5} defaultValue={listToLines(persona?.desired_outcomes)} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" placeholder="One outcome per line" />
        </label>
        <label className="text-sm font-medium md:col-span-2 xl:col-span-4">
          Objections / resistance
          <textarea name="objections" rows={4} defaultValue={listToLines(persona?.objections)} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" placeholder="One objection per line" />
        </label>
      </div>

      <details className="rounded-xl border border-zinc-200 bg-zinc-50/60">
        <summary className="cursor-pointer px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
          Advanced ICP fields
        </summary>
        <div className="grid gap-5 border-t border-zinc-200 p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">
            Segment
            <input name="segment" defaultValue={persona?.segment ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-medium">
            Confidence
            <input name="confidence_score" type="number" min="0" max="100" defaultValue={persona?.confidence_score ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" placeholder="0-100" />
          </label>
          <label className="text-sm font-medium md:col-span-2 xl:col-span-4">
            Job to be done
            <textarea name="job_to_be_done" rows={3} defaultValue={persona?.job_to_be_done ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            Buying triggers
            <textarea name="buying_triggers" rows={5} defaultValue={listToLines(persona?.buying_triggers)} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" placeholder="One trigger per line" />
          </label>
          <label className="text-sm font-medium">
            Tone preferences
            <textarea name="tone_preferences" rows={3} defaultValue={persona?.tone_preferences ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-medium">
            Claim sensitivity
            <textarea name="claim_sensitivity" rows={3} defaultValue={persona?.claim_sensitivity ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-medium md:col-span-2">
            Offer fit
            <textarea name="offer_fit" rows={3} defaultValue={persona?.offer_fit ?? ""} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-medium">
            Source
            <select name="source" defaultValue={persona?.source ?? "manual"} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
              <option value="manual">Manual</option>
              <option value="onboarding">Onboarding</option>
              <option value="ai_research">AI research</option>
            </select>
          </label>
        </div>
      </details>
    </div>
  );
}

export function PersonaManager({
  clientId,
  personas,
}: {
  clientId: string;
  personas: Persona[];
}) {
  return (
    <section className="mt-10 space-y-4">
      <div className="flex flex-col gap-3 border-b border-zinc-950 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="ui-section-title">ICPs / personas</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
            Keep ICPs lightweight and practical here so AI briefs and image prompts target a real audience instead of guessing from raw client notes.
          </p>
        </div>
        <PersonaCsvImporter clientId={clientId} />
      </div>

      <details className="border-y bg-white" open={!personas.length}>
        <summary className="cursor-pointer px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-violet-700">
          Add persona
        </summary>
        <ActionForm action={upsertClientPersona} className="border-t p-4">
          <input type="hidden" name="client_id" value={clientId} />
          <PersonaFields />
          <button className="ui-action ui-action-primary mt-5">Save persona</button>
        </ActionForm>
      </details>

      {!personas.length ? (
        <EmptyState title="No personas yet" description="Add at least one ICP so AI can generate briefs against a defined audience." />
      ) : (
        <div className="space-y-3">
          {personas.map((persona) => (
            <details key={persona.id} className="border-y bg-white" open={persona.is_primary}>
              <summary className="cursor-pointer px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                  <span>{persona.name}</span>
                  {persona.segment && <span>· {persona.segment}</span>}
                  {persona.is_primary && <span className="border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">Primary</span>}
                  {!persona.active && <span className="border border-zinc-200 bg-zinc-100 px-2 py-1 text-zinc-500">Inactive</span>}
                  <span className="text-zinc-400">{formatLabel(persona.source)}</span>
                </div>
              </summary>
              <div className="border-t p-4">
                <ActionForm action={upsertClientPersona}>
                  <input type="hidden" name="client_id" value={clientId} />
                  <input type="hidden" name="persona_id" value={persona.id} />
                  <PersonaFields persona={persona} />
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button className="ui-action ui-action-primary">Save persona</button>
                  </div>
                </ActionForm>
                <ActionForm action={deleteClientPersona} className="mt-3">
                  <input type="hidden" name="client_id" value={clientId} />
                  <input type="hidden" name="persona_id" value={persona.id} />
                  <button className="text-xs font-medium text-red-600">Delete persona</button>
                </ActionForm>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
