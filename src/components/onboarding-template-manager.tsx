"use client";

import { FileText, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  deleteOnboardingTemplate,
  saveOnboardingTemplate,
} from "@/actions/onboarding-templates";
import { OnboardingTemplateCsvImporter } from "@/components/onboarding-template-csv-importer";
import { DOSSIER_LABELS } from "@/lib/constants";
import {
  DEFAULT_ONBOARDING_TEMPLATE_NAME,
  DEFAULT_ONBOARDING_TEMPLATE_SCHEMA,
  createBlankOnboardingTemplateSchema,
  listOnboardingQuestions,
  type OnboardingGroup,
  type OnboardingQuestion,
  type OnboardingQuestionTarget,
  type OnboardingQuestionType,
  type OnboardingTemplateSchema,
} from "@/lib/onboarding";

type StoredOnboardingTemplate = {
  id: string;
  name: string;
  description: string | null;
  schema: OnboardingTemplateSchema;
  is_default: boolean;
  created_at: string;
};

type BuilderQuestion = OnboardingQuestion & {
  localId: string;
};

type BuilderGroup = Omit<OnboardingGroup, "questions"> & {
  localId: string;
  questions: BuilderQuestion[];
};

type BuilderSchema = {
  version: 1;
  groups: BuilderGroup[];
};

const TARGET_OPTIONS: Array<{ value: OnboardingQuestionTarget; label: string }> = [
  { value: "none", label: "Keep only in onboarding / knowledge notes" },
  { value: "knowledge_base", label: "Knowledge base" },
  ...Object.entries(DOSSIER_LABELS).map(([value, label]) => ({
    value: value as OnboardingQuestionTarget,
    label,
  })),
];

const TYPE_OPTIONS: Array<{ value: OnboardingQuestionType; label: string }> = [
  { value: "short", label: "Short text" },
  { value: "long", label: "Long text" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
  { value: "choice", label: "Single choice" },
  { value: "multi", label: "Multi select" },
];

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function slugifyKey(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function toBuilderSchema(schema: OnboardingTemplateSchema): BuilderSchema {
  return {
    version: 1,
    groups: schema.groups.map((group) => ({
      ...group,
      localId: randomId("group"),
      questions: group.questions.map((question) => ({
        ...question,
        options: question.options ? [...question.options] : undefined,
        localId: randomId("question"),
      })),
    })),
  };
}

function fromBuilderSchema(schema: BuilderSchema): OnboardingTemplateSchema {
  return {
    version: 1,
    groups: schema.groups.map((group, groupIndex) => ({
      key: slugifyKey(group.key || group.title, `section_${groupIndex + 1}`),
      title: group.title,
      description: group.description,
      questions: group.questions.map((question, questionIndex) => ({
        key: slugifyKey(question.key || question.label, `question_${groupIndex + 1}_${questionIndex + 1}`),
        target: question.target,
        label: question.label,
        type: question.type,
        required: question.required,
        placeholder: question.placeholder || undefined,
        options: question.options?.filter(Boolean),
      })),
    })),
  };
}

function createQuestion(): BuilderQuestion {
  return {
    localId: randomId("question"),
    key: randomId("question"),
    target: "none",
    label: "New question",
    type: "long",
    required: false,
    placeholder: "",
    options: [],
  };
}

function createGroup(): BuilderGroup {
  return {
    localId: randomId("group"),
    key: randomId("section"),
    title: "New section",
    description: "",
    questions: [createQuestion()],
  };
}

function countQuestions(schema: OnboardingTemplateSchema) {
  return listOnboardingQuestions(schema).length;
}

function TemplateOutline({
  schema,
}: {
  schema: OnboardingTemplateSchema;
}) {
  return (
    <div className="space-y-3 border-t border-zinc-200 px-4 py-4">
      {schema.groups.map((group) => (
        <div key={group.key} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-700">{group.title}</p>
          {group.description && <p className="mt-1 text-xs leading-5 text-zinc-500">{group.description}</p>}
          <ul className="mt-3 space-y-2">
            {group.questions.map((question) => (
              <li key={question.key} className="text-sm text-zinc-700">
                {question.label}
                <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  {TYPE_OPTIONS.find((option) => option.value === question.type)?.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TemplateEditor({
  template,
  initiallyOpen = false,
  newTemplate = false,
}: {
  template?: StoredOnboardingTemplate;
  initiallyOpen?: boolean;
  newTemplate?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [schema, setSchema] = useState<BuilderSchema>(() =>
    toBuilderSchema(template?.schema ?? DEFAULT_ONBOARDING_TEMPLATE_SCHEMA),
  );
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false);
  const [open, setOpen] = useState(initiallyOpen);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lockedRef = useRef(false);

  const initialState = useMemo(
    () => ({
      schema: toBuilderSchema(template?.schema ?? DEFAULT_ONBOARDING_TEMPLATE_SCHEMA),
      name: template?.name ?? "",
      description: template?.description ?? "",
      isDefault: template?.is_default ?? false,
    }),
    [template],
  );

  function updateGroup(localId: string, updater: (group: BuilderGroup) => BuilderGroup) {
    setSchema((current) => ({
      ...current,
      groups: current.groups.map((group) => group.localId === localId ? updater(group) : group),
    }));
  }

  function addGroup() {
    setSchema((current) => ({
      ...current,
      groups: [...current.groups, createGroup()],
    }));
  }

  function removeGroup(localId: string) {
    setSchema((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.localId !== localId),
    }));
  }

  function resetTo(schemaFactory: () => OnboardingTemplateSchema) {
    setSchema(toBuilderSchema(schemaFactory()));
    setMessage(null);
    setError(null);
  }

  function restoreLastSaved() {
    setSchema(initialState.schema);
    setName(initialState.name);
    setDescription(initialState.description);
    setIsDefault(initialState.isDefault);
    setMessage(null);
    setError(null);
  }

  function save() {
    if (pending || lockedRef.current) return;

    lockedRef.current = true;
    startTransition(async () => {
      try {
        setMessage(null);
        setError(null);

        const formData = new FormData();
        if (template?.id) formData.set("template_id", template.id);
        formData.set("name", name);
        formData.set("description", description);
        formData.set("schema", JSON.stringify(fromBuilderSchema(schema)));
        if (isDefault) formData.set("is_default", "on");

        const result = await saveOnboardingTemplate(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }

        setMessage(result.message);
        router.refresh();
        if (newTemplate && !template?.id) {
          setName("");
          setDescription("");
          setIsDefault(false);
          setSchema(toBuilderSchema(DEFAULT_ONBOARDING_TEMPLATE_SCHEMA));
        }
      } finally {
        lockedRef.current = false;
      }
    });
  }

  function remove() {
    if (!template?.id || pending || lockedRef.current) return;

    lockedRef.current = true;
    startTransition(async () => {
      try {
        setMessage(null);
        setError(null);

        const formData = new FormData();
        formData.set("template_id", template.id);
        const result = await deleteOnboardingTemplate(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }

        router.refresh();
      } finally {
        lockedRef.current = false;
      }
    });
  }

  const schemaQuestionCount = countQuestions(fromBuilderSchema(schema));

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="border-y bg-white">
      <summary className="cursor-pointer px-4 py-4">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          <span>{newTemplate ? "Create custom template" : name || "Untitled template"}</span>
          {!newTemplate && isDefault && <span className="border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">Default</span>}
          <span>{schema.groups.length} sections</span>
          <span>{schemaQuestionCount} questions</span>
        </div>
      </summary>
      <div className="border-t px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-start">
          <label className="text-sm font-medium">
            Template name
            <input
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Lead gen onboarding"
            />
          </label>
          <label className="text-sm font-medium">
            Description
            <input
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Optional internal note"
            />
          </label>
          <label className="flex items-center gap-2 pt-8 text-sm font-medium">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.currentTarget.checked)}
            />
            Agency default
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => resetTo(() => DEFAULT_ONBOARDING_TEMPLATE_SCHEMA)} className="ui-action">
            Start from standard
          </button>
          <button type="button" onClick={() => resetTo(createBlankOnboardingTemplateSchema)} className="ui-action">
            Start blank
          </button>
          {!newTemplate && (
            <button type="button" onClick={restoreLastSaved} className="ui-action">
              <RotateCcw className="size-3.5" />
              Reset changes
            </button>
          )}
        </div>

        {!schema.groups.length ? (
          <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm text-zinc-500">
            Add your first section to start building this onboarding form.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {schema.groups.map((group) => (
              <div key={group.localId} className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-start">
                  <label className="text-sm font-medium">
                    Section title
                    <input
                      value={group.title}
                      onChange={(event) => {
                        const title = event.currentTarget.value;
                        updateGroup(group.localId, (current) => ({
                          ...current,
                          title,
                          key: slugifyKey(title, current.key),
                        }));
                      }}
                      className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Section description
                    <input
                      value={group.description}
                      onChange={(event) => {
                        const descriptionValue = event.currentTarget.value;
                        updateGroup(group.localId, (current) => ({
                          ...current,
                          description: descriptionValue,
                        }));
                      }}
                      className="mt-1.5 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <button type="button" onClick={() => removeGroup(group.localId)} className="ui-action text-red-600">
                    <Trash2 className="size-3.5" />
                    Remove section
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  {group.questions.map((question) => (
                    <div key={question.localId} className="rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="grid gap-4 xl:grid-cols-2">
                        <label className="text-sm font-medium xl:col-span-2">
                          Question label
                          <input
                            value={question.label}
                            onChange={(event) => {
                              const label = event.currentTarget.value;
                              updateGroup(group.localId, (current) => ({
                                ...current,
                                questions: current.questions.map((item) => item.localId === question.localId
                                  ? { ...item, label, key: slugifyKey(label, item.key) }
                                  : item),
                              }));
                            }}
                            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-sm font-medium">
                          Field type
                          <select
                            value={question.type}
                            onChange={(event) => {
                              const type = event.currentTarget.value as OnboardingQuestionType;
                              updateGroup(group.localId, (current) => ({
                                ...current,
                                questions: current.questions.map((item) => item.localId === question.localId
                                  ? {
                                    ...item,
                                    type,
                                    options: type === "choice" || type === "multi"
                                      ? item.options?.length ? item.options : ["Option 1"]
                                      : [],
                                  }
                                  : item),
                              }));
                            }}
                            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                          >
                            {TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm font-medium">
                          Dossier target
                          <select
                            value={question.target}
                            onChange={(event) => {
                              const target = event.currentTarget.value as OnboardingQuestionTarget;
                              updateGroup(group.localId, (current) => ({
                                ...current,
                                questions: current.questions.map((item) => item.localId === question.localId
                                  ? { ...item, target }
                                  : item),
                              }));
                            }}
                            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                          >
                            {TARGET_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm font-medium xl:col-span-2">
                          Placeholder
                          <input
                            value={question.placeholder ?? ""}
                            onChange={(event) => {
                              const placeholder = event.currentTarget.value;
                              updateGroup(group.localId, (current) => ({
                                ...current,
                                questions: current.questions.map((item) => item.localId === question.localId
                                  ? { ...item, placeholder }
                                  : item),
                              }));
                            }}
                            className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                          />
                        </label>
                        {(question.type === "choice" || question.type === "multi") && (
                          <label className="text-sm font-medium xl:col-span-2">
                            Options
                            <textarea
                              rows={4}
                              value={(question.options ?? []).join("\n")}
                              onChange={(event) => {
                                const options = event.currentTarget.value
                                  .split(/\r?\n/)
                                  .map((item) => item.trim())
                                  .filter(Boolean);
                                updateGroup(group.localId, (current) => ({
                                  ...current,
                                  questions: current.questions.map((item) => item.localId === question.localId
                                    ? { ...item, options }
                                    : item),
                                }));
                              }}
                              className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm"
                            />
                            <span className="mt-1 block text-xs text-zinc-500">One option per line.</span>
                          </label>
                        )}
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={Boolean(question.required)}
                            onChange={(event) => {
                              const required = event.currentTarget.checked;
                              updateGroup(group.localId, (current) => ({
                                ...current,
                                questions: current.questions.map((item) => item.localId === question.localId
                                  ? { ...item, required }
                                  : item),
                              }));
                            }}
                          />
                          Required
                        </label>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            updateGroup(group.localId, (current) => ({
                              ...current,
                              questions: [...current.questions, createQuestion()],
                            }));
                          }}
                          className="ui-action"
                        >
                          <Plus className="size-3.5" />
                          Add question below
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updateGroup(group.localId, (current) => ({
                              ...current,
                              questions: current.questions.filter((item) => item.localId !== question.localId),
                            }));
                          }}
                          className="ui-action text-red-600"
                        >
                          <Trash2 className="size-3.5" />
                          Remove question
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" onClick={addGroup} className="ui-action">
            <Plus className="size-3.5" />
            Add section
          </button>
          {template?.id && (
            <button type="button" onClick={remove} disabled={pending} className="ui-action text-red-600 disabled:opacity-50">
              <Trash2 className="size-3.5" />
              Delete template
            </button>
          )}
          <button type="button" onClick={save} disabled={pending} className="ui-action ui-action-primary disabled:opacity-50">
            {pending ? "Saving..." : newTemplate ? "Create template" : "Save template"}
          </button>
        </div>
        {message && <p className="mt-3 text-xs text-emerald-700">{message}</p>}
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>
    </details>
  );
}

export function OnboardingTemplateManager({
  templates,
}: {
  templates: StoredOnboardingTemplate[];
}) {
  const standardQuestionCount = countQuestions(DEFAULT_ONBOARDING_TEMPLATE_SCHEMA);
  const customTemplateCount = templates.length;

  return (
    <div className="space-y-4">
      <details className="border-y bg-white">
        <summary className="cursor-pointer px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            <span>{DEFAULT_ONBOARDING_TEMPLATE_NAME}</span>
            <span className="border border-zinc-200 bg-zinc-100 px-2 py-1 text-zinc-600">Built in</span>
            <span>{DEFAULT_ONBOARDING_TEMPLATE_SCHEMA.groups.length} sections</span>
            <span>{standardQuestionCount} questions</span>
          </div>
        </summary>
        <div className="border-t px-4 py-4">
          <p className="max-w-3xl text-xs leading-5 text-zinc-500">
            This is the proven agency starter onboarding. It always stays available, and you can create as many custom templates as you need alongside it.
          </p>
          <TemplateOutline schema={DEFAULT_ONBOARDING_TEMPLATE_SCHEMA} />
        </div>
      </details>

      <details className="border-y bg-white">
        <summary className="cursor-pointer px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            <span>Custom templates</span>
            <span>{customTemplateCount}</span>
          </div>
        </summary>
        <div className="border-t px-4 py-4">
          <div className="space-y-4">
            <OnboardingTemplateCsvImporter />
            <TemplateEditor newTemplate />

            {!templates.length ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm text-zinc-500">
                No custom onboarding templates yet.
              </div>
            ) : (
              templates.map((template) => (
                <TemplateEditor key={template.id} template={template} />
              ))
            )}
          </div>
        </div>
      </details>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-4 py-4 text-xs leading-5 text-zinc-500">
        <p className="flex items-center gap-2 font-medium text-zinc-700">
          <FileText className="size-4 text-blue-600" />
          Mapping note
        </p>
        <p className="mt-2">
          Questions mapped to dossier sections merge into the client dossier. Questions left unmapped stay in onboarding submissions and are folded into knowledge notes when you merge answers.
        </p>
      </div>
    </div>
  );
}
