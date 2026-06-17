import Link from "next/link";
import { Activity, ClipboardList, FileText, Info, UserRoundCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const tabs: Array<[string, string, LucideIcon]> = [
  ["overview", "Overview", Info],
  ["tasks", "Tasks", ClipboardList],
  ["dossier", "Dossier", FileText],
  ["onboarding", "Onboarding", UserRoundCheck],
  ["activity", "Activity", Activity],
];

export function ClientTabs({ clientId, active, archived = false }: { clientId: string; active: string; archived?: boolean }) {
  const visibleTabs = archived
    ? tabs.filter(([value]) => value === "overview" || value === "activity")
    : tabs;

  return (
    <nav className="mb-9 flex gap-6 overflow-x-auto border-b">
      {visibleTabs.map(([value, label, Icon]) => (
        <Link
          key={String(value)}
          href={value === "tasks" ? `/clients/${clientId}?tab=tasks&list=general` : `/clients/${clientId}?tab=${value}`}
          className={`flex items-center gap-1.5 whitespace-nowrap border-b px-0 py-3 text-[11px] font-semibold uppercase tracking-[0.09em] ${
            active === value ? "border-blue-600 text-blue-700" : "border-transparent text-zinc-400 hover:text-zinc-900"
          }`}
        >
          <Icon className="size-3.5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
