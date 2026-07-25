"use client";

import {
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileClock,
  Gauge,
  KeyRound,
  Link2,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Tickets,
  UserCog,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/shell/sign-out-button";

const ICONS = {
  overview: Gauge,
  users: Users,
  properties: Building2,
  verifications: ClipboardCheck,
  reservations: CalendarDays,
  activities: CalendarClock,
  payments: CircleDollarSign,
  cases: Tickets,
  reports: BarChart3,
  roles: KeyRound,
  staff: UserCog,
  audit: FileClock,
  settings: Settings,
  integrations: Link2,
} as const;

export interface AdminNavItem {
  label: string;
  href: string;
  icon: keyof typeof ICONS;
  group: "Operations" | "Access control" | "Configuration";
}

function initials(name: string | null) {
  return (name || "CH").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function activeHref(pathname: string, nav: AdminNavItem[]) {
  return nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function Sidebar({ nav, pathname, close }: { nav: AdminNavItem[]; pathname: string; close?: () => void }) {
  const active = activeHref(pathname, nav);
  const groups = ["Operations", "Access control", "Configuration"] as const;
  return (
    <div className="flex h-full flex-col bg-[#0b1f33] text-white">
      <Link href="/admin" onClick={close} className="flex h-17 items-center gap-3 border-b border-white/10 px-5">
        <span className="grid size-9 place-items-center rounded-lg bg-teal-500 text-sm font-bold text-white">CH</span>
        <span>
          <span className="block font-display text-sm font-bold tracking-tight">CampusHomes</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Super admin</span>
        </span>
      </Link>
      <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => {
          const items = nav.filter((item) => item.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="mb-5">
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{group}</p>
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const selected = active === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      aria-current={selected ? "page" : undefined}
                      className={cn(
                        "group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400",
                        selected ? "bg-teal-500/16 text-teal-300" : "text-slate-300 hover:bg-white/7 hover:text-white",
                      )}
                    >
                      <Icon aria-hidden className={cn("size-4", selected ? "text-teal-300" : "text-slate-500 group-hover:text-slate-300")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4 text-xs leading-relaxed text-slate-400">
        <span className="mb-1 flex items-center gap-2 font-semibold text-emerald-300"><ShieldCheck aria-hidden className="size-3.5" /> Protected workspace</span>
        Permission-scoped access · actions audited
      </div>
    </div>
  );
}

export function AdminShell({ children, nav, user, roleLabel }: { children: React.ReactNode; nav: AdminNavItem[]; user: SessionUser; roleLabel: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => nav.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(query.toLowerCase())), [nav, query]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  return (
    <div className="min-h-screen bg-[#f4f7f9] text-slate-950 dark:bg-background dark:text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-62 lg:block"><Sidebar nav={nav} pathname={pathname} /></aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/60" onClick={() => setMenuOpen(false)} />
          <aside className="relative h-full w-72 max-w-[86vw] shadow-2xl"><Sidebar nav={nav} pathname={pathname} close={() => setMenuOpen(false)} /></aside>
        </div>
      )}

      <div className="lg:pl-62">
        <header className="sticky top-0 z-20 flex h-17 items-center gap-3 border-b border-slate-200/90 bg-white/95 px-4 backdrop-blur sm:px-6 dark:border-border dark:bg-background/95">
          <button type="button" aria-label="Open navigation" onClick={() => setMenuOpen(true)} className="grid size-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden dark:text-foreground dark:hover:bg-muted"><Menu aria-hidden className="size-5" /></button>
          <button type="button" onClick={() => setSearchOpen(true)} className="flex h-10 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-500 transition-colors hover:border-slate-300 sm:flex-none sm:w-80 dark:border-border dark:bg-muted dark:text-muted-foreground">
            <Search aria-hidden className="size-4" /><span className="truncate">Search the admin workspace</span><kbd className="ml-auto hidden rounded border px-1.5 py-0.5 text-[10px] sm:inline">/</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/admin/audit-log" aria-label="Review recent activity" className="relative grid size-10 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 dark:text-muted-foreground dark:hover:bg-muted"><Bell aria-hidden className="size-4.5" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-coral-500" /></Link>
            <div className="hidden h-8 w-px bg-slate-200 sm:block dark:bg-border" />
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((open) => !open)}
                className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-muted"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-900">{initials(user.name)}</span>
                <span className="hidden min-w-0 text-left sm:block"><span className="block max-w-32 truncate text-xs font-bold">{user.name || user.email}</span><span className="block text-[10px] text-slate-500 dark:text-muted-foreground">{roleLabel}</span></span>
                <ChevronDown aria-hidden className={cn("size-3.5 text-slate-400 transition-transform", userMenuOpen && "rotate-180")} />
              </button>
              {userMenuOpen && (
                <div role="menu" aria-label="Account" className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-border dark:bg-card">
                  <div className="border-b border-slate-100 px-4 py-3 dark:border-border">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-foreground">{user.name || user.email}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-muted-foreground">{roleLabel}</p>
                  </div>
                  <Link role="menuitem" href="/admin/profile" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-foreground dark:hover:bg-muted">
                    <UserRound aria-hidden className="size-4 text-slate-400" />
                    Profile settings
                  </Link>
                </div>
              )}
            </div>
            <SignOutButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 sm:py-7 xl:px-8">{children}</main>
      </div>

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/55 px-4 pt-[12vh]" onMouseDown={() => setSearchOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Search workspace" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-border dark:bg-card">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-border"><Search aria-hidden className="size-5 text-slate-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages…" className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none" /><button aria-label="Close search" onClick={() => setSearchOpen(false)} className="grid size-9 place-items-center rounded-md hover:bg-slate-100 dark:hover:bg-muted"><X aria-hidden className="size-4" /></button></div>
            <div className="max-h-80 overflow-y-auto p-2">
              {matches.map((item) => { const Icon = ICONS[item.icon]; return <Link key={item.href} href={item.href} onClick={() => setSearchOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-slate-100 dark:hover:bg-muted"><Icon aria-hidden className="size-4 text-teal-700" /><span className="font-semibold">{item.label}</span><span className="ml-auto text-xs text-slate-400">{item.group}</span></Link>; })}
              {!matches.length && <p className="px-3 py-8 text-center text-sm text-slate-500">No workspace pages match.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
