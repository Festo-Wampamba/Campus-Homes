"use client";

import {
  ArrowLeftRight,
  Bell,
  ChevronDown,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AccountAccess } from "@campushomes/shared";

import { api } from "@/lib/api";
import type { SessionUser } from "@/lib/session";
import {
  getSidebarCollapsed,
  getSidebarCollapsedServerSnapshot,
  setSidebarCollapsed,
  subscribeSidebarCollapsed,
} from "@/lib/sidebar-collapsed";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Wordmark } from "@/components/shell/wordmark";

type NotificationRow = {
  id: string;
  templateKey: string;
  payload: { message?: string; href?: string; threadId?: string };
  createdAt: string;
  readAt: string | null;
};

export interface AppNavItem {
  label: string;
  href: string;
  // A rendered element, not a component reference — nav is built in a
  // Server Component layout and passed down to this Client Component, and
  // only serializable values (including pre-rendered JSX) survive that
  // boundary; a raw component reference like `icon: Building2` doesn't.
  icon: React.ReactNode;
  // Optional — a nav list with no grouped items renders as one flat list
  // (student/landlord/ops today); admin's longer list groups into sections.
  group?: string;
}

function initials(name: string | null) {
  return (name || "CH").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function activeHref(pathname: string, nav: AppNavItem[]) {
  return nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function Sidebar({
  nav,
  pathname,
  close,
  collapsed,
  portalLabel,
  homeHref,
  attentionHrefs = new Set<string>(),
  attentionCounts = new Map<string, number>(),
}: {
  nav: AppNavItem[];
  pathname: string;
  close?: () => void;
  collapsed?: boolean;
  portalLabel: string;
  homeHref: string;
  attentionHrefs?: Set<string>;
  attentionCounts?: Map<string, number>;
}) {
  const active = activeHref(pathname, nav);
  const groups = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const item of nav) {
      const key = item.group ?? "";
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
    return ordered;
  }, [nav]);

  return (
    <div className="flex h-full flex-col border-r border-border bg-card text-foreground">
      <div className="flex h-17 items-center gap-3 border-b border-border px-5">
        <Link href={homeHref} onClick={close} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-600 text-sm font-bold text-white" aria-hidden>CH</span>
          {!collapsed && (
            <span className="min-w-0">
              <Wordmark className="text-[1.02rem]" />
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{portalLabel}</span>
            </span>
          )}
        </Link>
      </div>
      <nav aria-label="Primary navigation" className="scrollbar-hide flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => {
          const items = nav.filter((item) => (item.group ?? "") === group);
          if (!items.length) return null;
          return (
            <div key={group || "_"} className="mb-5">
              {!collapsed && group && <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{group}</p>}
              <div className="space-y-1">
                {items.map((item) => {
                  const selected = active === item.href;
                  const needsAttention = attentionHrefs.has(item.href);
                  const attentionCount = attentionCounts.get(item.href) ?? 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      title={collapsed ? item.label : undefined}
                      aria-current={selected ? "page" : undefined}
                      className={cn(
                        "group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400",
                        collapsed && "justify-center px-2",
                        selected ? "bg-accent text-teal-700 dark:bg-teal-500/16 dark:text-teal-300" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span className={cn("relative shrink-0", selected ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground group-hover:text-foreground")}>
                        {item.icon}
                        {needsAttention && <span aria-label="Action required" className="absolute -right-1.5 -top-1 size-2 rounded-full border border-card bg-red-500" />}
                      </span>
                      {!collapsed && <><span className="min-w-0 flex-1 truncate">{item.label}</span>{attentionCount > 0 && <span aria-label={`${attentionCount} unread`} className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{attentionCount > 99 ? "99+" : attentionCount}</span>}</>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export function AppShell({
  children,
  nav,
  user,
  access,
  portalLabel,
  homeHref,
  profileHref,
  settingsHref,
  auditLogHref,
  notificationsEndpoint,
  headerExtra,
}: {
  children: React.ReactNode;
  nav: AppNavItem[];
  user: SessionUser;
  /** Drives the "Switch workspace" account-menu link — shown only when the
   * account actually has more than one workspace to switch between. */
  access: AccountAccess;
  portalLabel: string;
  homeHref: string;
  /** Shows a "Profile settings" link in the account menu when provided. */
  profileHref?: string;
  /** Shows a "Settings" link in the account menu when provided. */
  settingsHref?: string;
  /** Optional audit-log shortcut for privileged workspaces. */
  auditLogHref?: string;
  /** In-app notification feed. Every workspace uses `/notifications`. */
  notificationsEndpoint?: string;
  /** Portal-specific header widget (e.g. ops' offline-sync indicator). */
  headerExtra?: React.ReactNode;
}) {
  const canSwitchWorkspace = new Set(access.workspaces).size > 1;
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeSidebarCollapsed, getSidebarCollapsed, getSidebarCollapsedServerSnapshot);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifMenuRef = useRef<HTMLDivElement | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [notifError, setNotifError] = useState(false);
  const [messageToast, setMessageToast] = useState<NotificationRow | null>(null);
  const knownNotificationIds = useRef<Set<string> | null>(null);
  const baseDocumentTitle = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => nav.filter((item) => `${item.label} ${item.group ?? ""}`.toLowerCase().includes(query.toLowerCase())), [nav, query]);
  const unreadNotifications = useMemo(() => notifications?.filter((item) => !item.readAt) ?? [], [notifications]);
  const attentionHrefs = useMemo(() => new Set(
    unreadNotifications
      .map((item) => item.payload?.href)
      .filter((href): href is string => Boolean(href && nav.some((item) => item.href === href))),
  ), [nav, unreadNotifications]);
  const attentionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of unreadNotifications) {
      const href = item.payload?.href;
      if (href && nav.some((navItem) => navItem.href === href)) counts.set(href, (counts.get(href) ?? 0) + 1);
    }
    return counts;
  }, [nav, unreadNotifications]);

  useEffect(() => {
    if (!userMenuOpen && !notifOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (userMenuOpen && !userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false);
      if (notifOpen && !notifMenuRef.current?.contains(event.target as Node)) setNotifOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
        setNotifOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen, notifOpen]);

  useEffect(() => {
    if (!notificationsEndpoint) return;
    let cancelled = false;
    const load = () => api<NotificationRow[]>(notificationsEndpoint)
      .then((data) => {
        if (!cancelled) {
          const next = data.slice(0, 50);
          if (knownNotificationIds.current) {
            const newestMessage = next.find((item) => !item.readAt && item.templateKey === "chat.message_received" && !knownNotificationIds.current?.has(item.id));
            if (newestMessage && pathname !== newestMessage.payload.href) setMessageToast(newestMessage);
          }
          knownNotificationIds.current = new Set(next.map((item) => item.id));
          setNotifications(next);
          setNotifError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNotifications([]);
          setNotifError(true);
        }
      });
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("campushomes:notifications-refresh", refresh);
    const interval = window.setInterval(load, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("campushomes:notifications-refresh", refresh);
    };
  }, [notificationsEndpoint, pathname]);

  useEffect(() => {
    const count = unreadNotifications.filter((item) => item.templateKey === "chat.message_received").length;
    baseDocumentTitle.current ??= document.title;
    document.title = count > 0 ? `(${count}) ${baseDocumentTitle.current}` : baseDocumentTitle.current;
    return () => { if (baseDocumentTitle.current) document.title = baseDocumentTitle.current; };
  }, [unreadNotifications]);

  function markNotificationRead(id: string) {
    setNotifications((current) => current?.map((item) => (
      item.id === id ? { ...item, readAt: new Date().toISOString() } : item
    )) ?? current);
    void api(`/notifications/${id}/read`, { method: "POST" }).catch(() => {
      // A later poll restores the server state if this optimistic update fails.
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-150 lg:block", collapsed ? "w-16" : "w-62")}>
        <Sidebar nav={nav} pathname={pathname} collapsed={collapsed} portalLabel={portalLabel} homeHref={homeHref} attentionHrefs={attentionHrefs} attentionCounts={attentionCounts} />
      </aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/60" onClick={() => setMenuOpen(false)} />
          <aside className="relative h-full w-72 max-w-[86vw] shadow-2xl">
            <Sidebar nav={nav} pathname={pathname} close={() => setMenuOpen(false)} portalLabel={portalLabel} homeHref={homeHref} attentionHrefs={attentionHrefs} attentionCounts={attentionCounts} />
          </aside>
        </div>
      )}

      <div className={cn("transition-[padding] duration-150", collapsed ? "lg:pl-16" : "lg:pl-62")}>
        <header className="sticky top-0 z-20 flex h-17 items-center gap-3 border-b border-slate-200/90 bg-white/95 px-4 backdrop-blur sm:px-6 dark:border-border dark:bg-background/95">
          <button type="button" aria-label="Open navigation" onClick={() => setMenuOpen(true)} className="grid size-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden dark:text-foreground dark:hover:bg-muted"><Menu aria-hidden className="size-5" /></button>
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed(!collapsed)}
            className="hidden size-10 shrink-0 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:grid dark:text-foreground dark:hover:bg-muted"
          >
            {collapsed ? <PanelLeftOpen aria-hidden className="size-4.5" /> : <PanelLeftClose aria-hidden className="size-4.5" />}
          </button>
          <button type="button" onClick={() => setSearchOpen(true)} className="flex h-10 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-500 transition-colors hover:border-slate-300 sm:flex-none sm:w-80 dark:border-border dark:bg-muted dark:text-muted-foreground">
            <Search aria-hidden className="size-4" /><span className="truncate">Search the workspace</span><kbd className="ml-auto hidden rounded border px-1.5 py-0.5 text-[10px] sm:inline">/</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            {headerExtra}
            <ThemeToggle />
            {notificationsEndpoint && (
              <div ref={notifMenuRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={notifOpen}
                  aria-label="Notifications"
                  onClick={() => setNotifOpen((open) => !open)}
                  className="relative grid size-10 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 dark:text-muted-foreground dark:hover:bg-muted"
                >
                  <Bell aria-hidden className="size-4.5" />
                  {!!unreadNotifications.length && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-red-500" />}
                </button>
                {notifOpen && (
                  <div role="menu" aria-label="Notifications" className="absolute right-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-border dark:bg-card">
                    <div className="border-b border-slate-100 px-4 py-3 dark:border-border">
                      <p className="text-sm font-bold text-slate-900 dark:text-foreground">Notifications</p>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications === null && <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-muted-foreground">Loading…</p>}
                      {notifications !== null && notifError && <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-muted-foreground">Couldn&apos;t load recent activity.</p>}
                      {notifications !== null && !notifError && !notifications.length && <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-muted-foreground">Nothing new.</p>}
                      {notifications !== null && !notifError && notifications.map((item) => {
                        const content = <><p className="text-sm font-semibold text-slate-800 dark:text-foreground">{item.payload?.message ?? item.templateKey}</p><p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p></>;
                        const className = cn("block border-b border-slate-100 px-4 py-3 last:border-0 dark:border-border", !item.readAt && "bg-teal-50/60 dark:bg-teal-500/10");
                        return item.payload?.href ? <Link key={item.id} href={item.payload.href} onClick={() => { markNotificationRead(item.id); setNotifOpen(false); }} className={className}>{content}</Link> : <button key={item.id} type="button" onClick={() => markNotificationRead(item.id)} className={cn(className, "w-full text-left")}>{content}</button>;
                      })}
                    </div>
                    {auditLogHref && <Link href={auditLogHref} onClick={() => setNotifOpen(false)} className="block px-4 py-3 text-center text-sm font-bold text-teal-700 transition-colors hover:bg-slate-50 dark:hover:bg-muted">View audit log</Link>}
                  </div>
                )}
              </div>
            )}
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
                <span className="hidden min-w-0 text-left sm:block"><span className="block max-w-32 truncate text-xs font-bold">{user.name || user.email}</span><span className="block text-[10px] text-slate-500 dark:text-muted-foreground">{portalLabel}</span></span>
                <ChevronDown aria-hidden className={cn("size-3.5 text-slate-400 transition-transform", userMenuOpen && "rotate-180")} />
              </button>
              {userMenuOpen && (
                <div role="menu" aria-label="Account" className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-border dark:bg-card">
                  <div className="border-b border-slate-100 px-4 py-3 dark:border-border">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-foreground">{user.name || "Unnamed"}</p>
                    {user.email && <p className="truncate text-xs text-slate-500 dark:text-muted-foreground">{user.email}</p>}
                    {user.phoneNumber && <p className="truncate text-xs text-slate-500 dark:text-muted-foreground">{user.phoneNumber}</p>}
                    <p className="mt-1.5 inline-block rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">{portalLabel}</p>
                  </div>
                  {profileHref && (
                    <Link role="menuitem" href={profileHref} onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-foreground dark:hover:bg-muted">
                      <UserRound aria-hidden className="size-4 text-slate-400" />
                      Profile settings
                    </Link>
                  )}
                  {auditLogHref && (
                    <Link role="menuitem" href={auditLogHref} onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-foreground dark:hover:bg-muted">
                      <Bell aria-hidden className="size-4 text-slate-400" />
                      Audit log
                    </Link>
                  )}
                  {settingsHref && (
                    <Link role="menuitem" href={settingsHref} onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-foreground dark:hover:bg-muted">
                      <Settings aria-hidden className="size-4 text-slate-400" />
                      Settings
                    </Link>
                  )}
                  {canSwitchWorkspace && (
                    <Link role="menuitem" href="/choose-workspace" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-foreground dark:hover:bg-muted">
                      <ArrowLeftRight aria-hidden className="size-4 text-slate-400" />
                      Switch workspace
                    </Link>
                  )}
                </div>
              )}
            </div>
            <SignOutButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 sm:py-7 xl:px-8">{children}</main>
      </div>

      {messageToast && (
        <div role="status" className="fixed bottom-5 right-5 z-50 w-[min(24rem,calc(100vw-2.5rem))] rounded-xl border border-teal-200 bg-white p-4 shadow-2xl dark:border-teal-800 dark:bg-card">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-100"><Bell aria-hidden className="size-4 text-teal-700" /></span>
            <div className="min-w-0 flex-1"><p className="font-bold">New message</p><p className="mt-0.5 text-sm text-muted-foreground">{messageToast.payload.message ?? "You received a new message."}</p><div className="mt-3 flex gap-2">{messageToast.payload.href && <Link href={`${messageToast.payload.href}${messageToast.payload.threadId ? `?thread=${messageToast.payload.threadId}` : ""}`} onClick={() => { markNotificationRead(messageToast.id); setMessageToast(null); }} className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-bold text-white">View message</Link>}<button type="button" onClick={() => setMessageToast(null)} className="rounded-md border border-border px-3 py-1.5 text-xs font-bold">Dismiss</button></div></div>
            <button type="button" aria-label="Dismiss notification" onClick={() => setMessageToast(null)}><X aria-hidden className="size-4" /></button>
          </div>
        </div>
      )}

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/55 px-4 pt-[12vh]" onMouseDown={() => setSearchOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Search workspace" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-border dark:bg-card">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-border"><Search aria-hidden className="size-5 text-slate-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages…" className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none" /><button aria-label="Close search" onClick={() => setSearchOpen(false)} className="grid size-9 place-items-center rounded-md hover:bg-slate-100 dark:hover:bg-muted"><X aria-hidden className="size-4" /></button></div>
            <div className="max-h-80 overflow-y-auto p-2">
              {matches.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setSearchOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-slate-100 dark:hover:bg-muted">
                  <span className="text-teal-700">{item.icon}</span>
                  <span className="font-semibold">{item.label}</span>
                  {item.group && <span className="ml-auto text-xs text-slate-400">{item.group}</span>}
                </Link>
              ))}
              {!matches.length && <p className="px-3 py-8 text-center text-sm text-slate-500">No workspace pages match.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
