"use client";

import { BriefcaseBusiness, FolderKanban, Palette, Settings, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/my-work", label: "My Work", icon: FolderKanban },
  { href: "/creative-master", label: "Creative Master", icon: Palette },
];

export function Sidebar({
  agencyName,
  userLabel,
  clients,
  signOutAction,
}: {
  agencyName: string;
  userLabel: string;
  clients: Array<{ id: string; name: string }>;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <aside className="flex h-full w-64 flex-col border-r bg-white px-3 py-4">
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="grid size-9 place-items-center rounded-xl bg-zinc-950 text-white">
          <BriefcaseBusiness className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{agencyName}</p>
          <p className="text-xs text-zinc-500">Agency Desk</p>
        </div>
        <button className="ml-auto md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>
      <nav className="space-y-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
        <Link
          href="/clients"
          onClick={() => setOpen(false)}
          className={`mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            pathname === "/clients" ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
          }`}
        >
          <Users className="size-4" />
          Clients
        </Link>
        <div className="max-h-[42vh] space-y-0.5 overflow-y-auto pl-7 pr-1">
          {clients.map((client) => {
            const active = pathname === `/clients/${client.id}`;
            return (
              <Link
                key={client.id}
                href={`/clients/${client.id}?tab=tasks&list=general`}
                onClick={() => setOpen(false)}
                className={`block truncate rounded-md px-3 py-1.5 text-xs transition ${
                  active ? "bg-zinc-100 font-semibold text-zinc-950" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                {client.name}
              </Link>
            );
          })}
        </div>
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className={`mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
            pathname.startsWith("/settings") ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
          }`}
        >
          <Settings className="size-4" />
          Settings
        </Link>
      </nav>
      <div className="mt-auto border-t px-2 pt-4">
        <p className="truncate text-xs text-zinc-500">{userLabel}</p>
        <form action={signOutAction}>
          <button className="mt-2 text-xs font-medium text-zinc-700 hover:text-zinc-950">Sign out</button>
        </form>
      </div>
    </aside>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-30 rounded-lg border bg-white p-2 shadow-sm md:hidden"
        aria-label="Open menu"
      >
        <BriefcaseBusiness className="size-5" />
      </button>
      <div className="fixed inset-y-0 left-0 hidden md:block">{nav}</div>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-64" onClick={(event) => event.stopPropagation()}>
            {nav}
          </div>
        </div>
      )}
    </>
  );
}
