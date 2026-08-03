import { saveDossier } from "@/actions/crm";
import { ActionForm } from "@/components/action-form";
import { DOSSIER_LABELS, DOSSIER_SECTIONS } from "@/lib/constants";
import {
  DOSSIER_SECTION_QUESTIONS,
  dossierQuestionFieldName,
  dossierSectionNotesFieldName,
  dossierSectionPreservedFieldName,
} from "@/lib/dossier";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean).join("\n");
  }
  return typeof value === "string" ? value : "";
}

export function DossierForm({
  clientId,
  dossier,
}: {
  clientId: string;
  dossier: Record<string, unknown> | null;
}) {
  return (
    <ActionForm action={saveDossier} className="space-y-0">
      <input type="hidden" name="client_id" value={clientId} />
      {DOSSIER_SECTIONS.map((section, index) => {
        const questions = DOSSIER_SECTION_QUESTIONS[section];
        const sectionValue = dossier?.[section];
        const sectionRecord = isRecord(sectionValue) ? sectionValue : {};
        const knownKeys = new Set(questions.map((question) => question.key));
        const preservedEntries = isRecord(sectionValue)
          ? Object.fromEntries(
            Object.entries(sectionRecord).filter(
              ([key]) => key !== "notes" && !knownKeys.has(key),
            ),
          )
          : sectionValue == null
            ? {}
            : { legacy_value: sectionValue };
        const notesValue = typeof sectionRecord.notes === "string" ? sectionRecord.notes : "";

        return (
          <details key={section} open={index === 0} className="border-b bg-white first:border-t">
            <summary className="cursor-pointer py-4 text-[11px] font-semibold uppercase tracking-[0.1em]">{DOSSIER_LABELS[section]}</summary>
            <div className="border-t py-5">
              <p className="mb-4 text-xs leading-5 text-zinc-500">
                Structured onboarding answers land here and can be edited directly without raw JSON.
              </p>
              <input
                type="hidden"
                name={dossierSectionPreservedFieldName(section)}
                value={JSON.stringify(preservedEntries)}
              />
              {questions.length > 0 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {questions.map((question) => {
                    const fieldName = dossierQuestionFieldName(question.key);
                    const defaultValue = stringValue(sectionRecord[question.key]);

                    if (question.type === "long" || question.type === "multi") {
                      return (
                        <label key={question.key} className={`text-sm font-medium ${question.type === "long" ? "lg:col-span-2" : ""}`}>
                          <span className="block normal-case text-sm font-medium tracking-normal text-zinc-800">
                            {question.label}
                          </span>
                          <textarea
                            name={fieldName}
                            rows={question.type === "multi" ? 4 : 5}
                            defaultValue={defaultValue}
                            placeholder={question.placeholder}
                            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                          />
                          {question.type === "multi" ? (
                            <span className="mt-1.5 block text-xs normal-case tracking-normal text-zinc-500">
                              One item per line.
                            </span>
                          ) : null}
                        </label>
                      );
                    }

                    if (question.type === "choice" && question.options?.length) {
                      return (
                        <label key={question.key} className="text-sm font-medium">
                          <span className="block normal-case text-sm font-medium tracking-normal text-zinc-800">
                            {question.label}
                          </span>
                          <select
                            name={fieldName}
                            defaultValue={defaultValue}
                            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                          >
                            <option value="">Select</option>
                            {question.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    }

                    return (
                      <label key={question.key} className="text-sm font-medium">
                        <span className="block normal-case text-sm font-medium tracking-normal text-zinc-800">
                          {question.label}
                        </span>
                        <input
                          name={fieldName}
                          type={question.type === "email" ? "email" : question.type === "url" ? "url" : "text"}
                          defaultValue={defaultValue}
                          placeholder={question.placeholder}
                          className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                        />
                      </label>
                    );
                  })}
                </div>
              ) : null}
              <label className="mt-5 block text-sm font-medium">
                <span className="block normal-case text-sm font-medium tracking-normal text-zinc-800">
                  Section notes
                </span>
                <textarea
                  name={dossierSectionNotesFieldName(section)}
                  rows={5}
                  defaultValue={notesValue}
                  className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder={`Additional notes for ${DOSSIER_LABELS[section].toLowerCase()}.`}
                />
              </label>
            </div>
          </details>
        );
      })}
      <div className="grid gap-5 border-y bg-white py-6 lg:grid-cols-2">
        <label className="text-sm font-medium">
          <span className="block normal-case text-sm font-medium tracking-normal text-zinc-800">
            Knowledge base
          </span>
          <textarea name="knowledge_base" rows={8} defaultValue={String(dossier?.knowledge_base ?? "")} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
        </label>
        <label className="text-sm font-medium">
          <span className="block normal-case text-sm font-medium tracking-normal text-zinc-800">
            AI summary
          </span>
          <textarea name="ai_summary" rows={8} defaultValue={String(dossier?.ai_summary ?? "")} className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" />
        </label>
      </div>
      <button className="ui-action ui-action-primary mt-6">Save dossier</button>
    </ActionForm>
  );
}
