"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveOnboardingDraft, submitOnboarding } from "@/actions/public";
import {
  type OnboardingDraft,
  type OnboardingQuestion,
  type OnboardingTemplateSchema,
  listOnboardingQuestions,
} from "@/lib/onboarding";

type DraftStatus = "ready" | "restored" | "local" | "saving" | "saved" | "error" | "submitting";

function hasAnswers(draft: OnboardingDraft) {
  return Object.values(draft).some((value) => Array.isArray(value) ? value.length > 0 : value.length > 0);
}

function serializeForm(form: HTMLFormElement, schema: OnboardingTemplateSchema): OnboardingDraft {
  const formData = new FormData(form);
  return Object.fromEntries(
    listOnboardingQuestions(schema).map((question) => [
      question.key,
      question.type === "multi"
        ? formData.getAll(question.key).map(String)
        : String(formData.get(question.key) ?? ""),
    ]),
  );
}

function restoreForm(form: HTMLFormElement, draft: OnboardingDraft) {
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) continue;
    if (!element.name || element.name === "token") continue;
    const value = draft[element.name];
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      element.checked = Array.isArray(value) && value.includes(element.value);
    } else if (typeof value === "string") {
      element.value = value;
    }
  }
}

function parseLocalDraft(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { answers?: unknown; updatedAt?: unknown };
    if (!parsed.answers || typeof parsed.answers !== "object" || typeof parsed.updatedAt !== "string") return null;
    return { answers: parsed.answers as OnboardingDraft, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

function readLocalDraft(storageKey: string) {
  try {
    return parseLocalDraft(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function writeLocalDraft(storageKey: string, draft: OnboardingDraft) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ answers: draft, updatedAt: new Date().toISOString() }));
  } catch {
    // The server draft still protects the form when browser storage is unavailable.
  }
}

function clearLocalDraft(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Ignore browsers that block local storage.
  }
}

export function OnboardingForm({
  token,
  companyName,
  serverDraft,
  schema,
  previouslySubmitted,
}: {
  token: string;
  companyName: string;
  serverDraft: OnboardingDraft;
  schema: OnboardingTemplateSchema;
  previouslySubmitted: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const queuedDraftRef = useRef<OnboardingDraft | null>(null);
  const [status, setStatus] = useState<DraftStatus>(hasAnswers(serverDraft) ? "restored" : "ready");
  const storageKey = `onboarding-draft:${token}`;

  const flushServerDraft = useCallback(async function flushDraft() {
    if (savingRef.current || !queuedDraftRef.current) return;
    const draft = queuedDraftRef.current;
    queuedDraftRef.current = null;
    savingRef.current = true;
    setStatus("saving");

    try {
      await saveOnboardingDraft(token, draft);
      setStatus("saved");
      if (!queuedDraftRef.current) clearLocalDraft(storageKey);
    } catch {
      queuedDraftRef.current = draft;
      setStatus("error");
    } finally {
      savingRef.current = false;
      if (queuedDraftRef.current && navigator.onLine) {
        saveTimerRef.current = setTimeout(flushDraft, 1_200);
      }
    }
  }, [storageKey, token]);

  function queueDraft(draft: OnboardingDraft) {
    writeLocalDraft(storageKey, draft);
    queuedDraftRef.current = draft;
    setStatus("local");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushServerDraft, 1_200);
  }

  useEffect(() => {
    const form = formRef.current;
    const localDraft = readLocalDraft(storageKey);
    if (form && localDraft) {
      restoreForm(form, localDraft.answers);
      queuedDraftRef.current = localDraft.answers;
      setStatus("restored");
      saveTimerRef.current = setTimeout(flushServerDraft, 300);
    }

    const retry = () => {
      if (queuedDraftRef.current) void flushServerDraft();
    };
    window.addEventListener("online", retry);
    return () => {
      window.removeEventListener("online", retry);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [flushServerDraft, storageKey]);

  return (
    <form
      ref={formRef}
      action={submitOnboarding}
      className="space-y-12"
      onInput={(event) => queueDraft(serializeForm(event.currentTarget, schema))}
      onSubmit={() => {
        setStatus("submitting");
        clearLocalDraft(storageKey);
      }}
    >
      <input type="hidden" name="token" value={token} />
      {schema.groups.map((group, index) => (
        <section key={group.key}>
          <div className="mb-4 flex items-start gap-4 border-b border-zinc-950 pb-3">
            <span className="font-mono text-[10px] text-blue-700">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.08em]">{group.title}</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{group.description}</p>
            </div>
          </div>
          <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
            {group.questions.map((question) => (
              <QuestionField
                key={question.key}
                question={question}
                defaultValue={serverDraft[question.key] ?? (question.key === "company_name" ? companyName : "")}
              />
            ))}
          </div>
        </section>
      ))}
      <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-zinc-950 bg-white/95 py-4 backdrop-blur">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500" aria-live="polite">
          {status === "ready" && "Autosave ready"}
          {status === "restored" && "Draft restored"}
          {status === "local" && "Saved on this device"}
          {status === "saving" && "Saving draft..."}
          {status === "saved" && "Draft autosaved"}
          {status === "error" && "Saved on this device · waiting to sync"}
          {status === "submitting" && "Submitting..."}
        </p>
        <button disabled={status === "submitting"} className="ui-action ui-action-primary disabled:opacity-50">
          {previouslySubmitted ? "Submit again" : "Submit onboarding"}
        </button>
      </div>
    </form>
  );
}

function QuestionField({
  question,
  defaultValue,
}: {
  question: OnboardingQuestion;
  defaultValue: string | string[];
}) {
  const fullWidth = question.type === "long" || question.type === "multi";
  return (
    <fieldset className={fullWidth ? "md:col-span-2" : ""}>
      <legend className="text-xs font-semibold leading-5 text-zinc-800">
        {question.label}{question.required ? <span className="text-red-600"> *</span> : null}
      </legend>
      {question.type === "long" ? (
        <textarea
          name={question.key}
          required={question.required}
          rows={5}
          defaultValue={typeof defaultValue === "string" ? defaultValue : ""}
          placeholder={question.placeholder}
          className="mt-2 w-full border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 focus:border-blue-600"
        />
      ) : question.type === "multi" ? (
        <div className="mt-2 grid gap-2 border-y border-zinc-200 py-3 sm:grid-cols-2 lg:grid-cols-3">
          {question.options?.map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs hover:bg-blue-50">
              <input
                type="checkbox"
                name={question.key}
                value={option}
                defaultChecked={Array.isArray(defaultValue) && defaultValue.includes(option)}
                className="size-3.5 accent-blue-600"
              />
              {option}
            </label>
          ))}
        </div>
      ) : question.type === "choice" ? (
        <select
          name={question.key}
          required={question.required}
          defaultValue={typeof defaultValue === "string" ? defaultValue : ""}
          className="mt-2 w-full border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-600"
        >
          <option value="">Select</option>
          {question.options?.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          name={question.key}
          type={question.type === "email" || question.type === "url" ? question.type : "text"}
          required={question.required}
          defaultValue={typeof defaultValue === "string" ? defaultValue : ""}
          placeholder={question.placeholder}
          className="mt-2 w-full border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-blue-600"
        />
      )}
    </fieldset>
  );
}
