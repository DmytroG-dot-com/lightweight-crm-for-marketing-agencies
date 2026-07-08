"use client";

import { BarChart3, Bell, BriefcaseBusiness, FolderKanban, Menu, Palette, Settings, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { INBOX_UNREAD_REFRESH_EVENT } from "@/lib/inbox-events";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/inbox", label: "Inbox", icon: Bell, tone: "text-blue-600" },
  { href: "/my-work", label: "My Work", icon: FolderKanban, tone: "text-blue-600" },
  { href: "/creative-master", label: "Creative Master", icon: Palette, tone: "text-violet-600" },
];

export function Sidebar({
  agencyId,
  agencyName,
  userLabel,
  userId,
  clients,
  unreadCount,
  canManageTeam,
  signOutAction,
}: {
  agencyId: string;
  agencyName: string;
  userLabel: string;
  userId: string;
  clients: Array<{ id: string; name: string }>;
  unreadCount: number;
  canManageTeam: boolean;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [liveUnreadCount, setLiveUnreadCount] = useState(unreadCount);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    setLiveUnreadCount(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    let active = true;

    async function refreshUnreadCount() {
      const { count, error } = await supabase
        .from("notifications")
        .select("id, clients!inner(status)", { count: "exact", head: true })
        .eq("agency_id", agencyId)
        .eq("recipient_id", userId)
        .neq("clients.status", "archived")
        .is("read_at", null)
        .is("cleared_at", null);
      if (!active || error || typeof count !== "number") return;
      setLiveUnreadCount(count);
    }

    const handleRefresh = () => {
      void refreshUnreadCount();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") handleRefresh();
    };

    handleRefresh();
    const intervalId = window.setInterval(handleRefresh, 15000);
    window.addEventListener("focus", handleRefresh);
    window.addEventListener(INBOX_UNREAD_REFRESH_EVENT, handleRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener(INBOX_UNREAD_REFRESH_EVENT, handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [agencyId, supabase, userId]);

  const nav = (
    <aside className="flex h-full w-[270px] flex-col border-r border-zinc-950 bg-white px-7 py-8">
      <div className="mb-14 flex items-start gap-3">
        <div className="ui-icon-box border-blue-600 bg-blue-600 text-white">
          <BriefcaseBusiness className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-normal uppercase leading-tight tracking-[-0.04em]">{agencyName}</p>
        </div>
        <button className="ml-auto md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="size-5" />
        </button>
      </div>
      <nav>
        <div className="space-y-1">
        {links.map(({ href, label, icon: Icon, tone }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 border-b py-2 text-xs font-medium uppercase tracking-[0.06em] transition ${
                active ? "border-blue-600 text-zinc-950" : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-950"
              }`}
            >
              <Icon className={`size-3.5 ${active ? tone : "text-zinc-300"}`} />
              {label}
              {href === "/inbox" && liveUnreadCount > 0 && (
                <span className="ml-auto bg-blue-600 px-1.5 py-0.5 font-mono text-[9px] text-white">
                  {liveUnreadCount > 99 ? "99+" : liveUnreadCount}
                </span>
              )}
            </Link>
          );
        })}
        </div>
        <p className="ui-kicker mb-3 mt-10">Clients</p>
        <Link
          href="/clients"
          onClick={() => setOpen(false)}
          className={`flex items-center gap-2 border-b py-2 text-xs font-medium uppercase tracking-[0.06em] transition ${
            pathname === "/clients" ? "border-blue-600 text-zinc-950" : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-950"
          }`}
        >
          <Users className={`size-3.5 ${pathname === "/clients" ? "text-blue-600" : "text-zinc-300"}`} />
          All Clients
        </Link>
        <div className="mt-2 max-h-[38vh] overflow-y-auto">
          {clients.map((client) => {
            const active = pathname === `/clients/${client.id}`;
            return (
              <Link
                key={client.id}
                href={`/clients/${client.id}?tab=tasks&list=general`}
                onClick={() => setOpen(false)}
                className={`block border-b border-zinc-100 py-2 text-[11px] uppercase tracking-[0.04em] transition ${
                  active ? "border-l-2 border-blue-600 pl-2 text-zinc-950" : "text-zinc-400 hover:text-zinc-900"
                }`}
              >
                <span className="truncate">{client.name}</span>
              </Link>
            );
          })}
        </div>
        {canManageTeam && (
          <Link
            href="/team"
            onClick={() => setOpen(false)}
            className={`mt-10 flex items-center gap-2 border-b py-2 text-xs font-medium uppercase tracking-[0.06em] transition ${
              pathname.startsWith("/team") ? "border-blue-600 text-zinc-950" : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-950"
            }`}
          >
            <BarChart3 className={`size-3.5 ${pathname.startsWith("/team") ? "text-blue-600" : "text-zinc-300"}`} />
            Team
          </Link>
        )}
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className={`${canManageTeam ? "mt-1" : "mt-10"} flex items-center gap-2 border-b py-2 text-xs font-medium uppercase tracking-[0.06em] transition ${
            pathname.startsWith("/settings") ? "border-blue-600 text-zinc-950" : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-950"
          }`}
        >
          <Settings className={`size-3.5 ${pathname.startsWith("/settings") ? "text-blue-600" : "text-zinc-300"}`} />
          Settings
        </Link>
      </nav>
      <div className="mt-auto border-t border-zinc-950 pt-4">
        <p className="truncate text-xs uppercase tracking-[0.04em] text-zinc-700">{userLabel}</p>
        <form action={signOutAction}>
          <button className="mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400 hover:text-zinc-950">Sign out</button>
        </form>
      </div>
    </aside>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-30 border border-zinc-950 bg-white p-2 md:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>
      <div className="fixed inset-y-0 left-0 z-20 hidden md:block">{nav}</div>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-[270px]" onClick={(event) => event.stopPropagation()}>
            {nav}
          </div>
        </div>
      )}
    </>
  );
}
