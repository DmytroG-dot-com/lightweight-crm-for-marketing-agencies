import Link from "next/link";

const tabs = [
  ["overview", "Overview"],
  ["tasks", "Tasks"],
  ["dossier", "Dossier"],
  ["recurring", "Recurring"],
  ["onboarding", "Onboarding"],
  ["activity", "Activity"],
];

export function ClientTabs({ clientId, active }: { clientId: string; active: string }) {
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b">
      {tabs.map(([value, label]) => (
        <Link
          key={value}
          href={value === "tasks" ? `/clients/${clientId}?tab=tasks&list=general` : `/clients/${clientId}?tab=${value}`}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            active === value ? "border-zinc-950 text-zinc-950" : "border-transparent text-zinc-500 hover:text-zinc-900"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
