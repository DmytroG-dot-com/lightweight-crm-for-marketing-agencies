import { PageHeader } from "@/components/page-header";

const rules = [
  "Open My Work first every day.",
  "Work in this order: Overdue, Today, then Next.",
  "Use comments for updates, questions, blockers, and handoff notes.",
  "Set a task to In Progress when you start it.",
  "Set a task to Blocked if you cannot continue, and explain why in comments.",
  "When the work is done, leave a comment with what was completed.",
  "If the task was complex or took more than 5 minutes, record a short walkthrough video and attach it in comments.",
  "When your part is done, set the task to Review.",
  "Only PM / Delivery Manager should move approved work to Complete.",
];

const statuses = [
  { label: "To Do", description: "Assigned, not started." },
  { label: "In Progress", description: "Being worked on now." },
  { label: "Blocked", description: "Cannot continue. Explain in comments." },
  { label: "Review", description: "Done and ready for PM / Delivery Manager review." },
  { label: "Complete", description: "Approved and fully closed." },
];

export default function SopPage() {
  return (
    <>
      <PageHeader
        title="Mini SOP"
        description="Daily workflow for team members using Agency CRM."
      />

      <div className="max-w-3xl space-y-10">
        <section>
          <h2 className="ui-section-title border-b border-zinc-950 pb-3">Daily Flow</h2>
          <ol className="mt-5 space-y-3 text-sm leading-6 text-zinc-600">
            {rules.map((rule, index) => (
              <li key={rule} className="flex gap-3 border-b border-zinc-100 pb-3">
                <span className="font-mono text-[10px] text-zinc-400">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="ui-section-title border-b border-zinc-950 pb-3">Task Statuses</h2>
          <div className="mt-5 space-y-3">
            {statuses.map((status) => (
              <div key={status.label} className="border border-zinc-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-950">
                  {status.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-zinc-600">{status.description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
