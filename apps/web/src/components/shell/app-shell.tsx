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
import { Dialog, DialogBody } from "@/components/ui/dialog";
import { HeaderPanel } from "./header-panel";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Wordmark } from "@/components/shell/wordmark";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { IdleTimeout } from "@/components/shell/idle-timeout";

export type NotificationRow = {
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

/** Unread notifications behind the open page's sidebar badge (same exact-href
 * rule the badge uses). Opening that page counts as seeing them, so they are
 * marked read on the server and the dot stays gone after a reload. Chat
 * notifications link to the inbox but belong to one thread (payload.threadId);
 * opening the inbox doesn't mean every thread was read, so they're skipped. */
export function notificationsSeenOn(unread: NotificationRow[], pathname: string, nav: AppNavItem[]): string[] {
  const active = activeHref(pathname, nav);
  if (!active) return [];
  return unread.filter((item) => item.payload?.href === active && !item.payload?.threadId).map((item) => item.id);
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
      <div className="flex min-h-17 items-center gap-3 border-b border-border px-5 py-3">
        <Link href={homeHref} onClick={close} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-600 text-sm font-bold text-white" aria-hidden>CH</span>
          {!collapsed && (
            <span className="min-w-0">
              <Wordmark className="text-[1.02rem]" />
              <span className="block whitespace-normal break-words text-xs font-semibold uppercase leading-relaxed tracking-[0.14em] text-muted-foreground">{portalLabel}</span>
            </span>
          )}
        </Link>
        {close && <button type="button" aria-label="Close navigation" onClick={close} className="grid size-[44px] shrink-0 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-ring"><X aria-hidden className="size-5" /></button>}
      </div>
      <nav aria-label="Primary navigation" className="scrollbar-hide flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => {
          const items = nav.filter((item) => (item.group ?? "") === group);
          if (!items.length) return null;
          return (
            <div key={group || "_"} className="mb-5">
              {!collapsed && group && <p className="mb-1.5 px-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{group}</p>}
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
                        "group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400",
                        collapsed && "justify-center px-2",
                        selected ? "bg-accent text-teal-700 dark:bg-teal-500/16 dark:text-teal-300" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span className={cn("relative shrink-0", selected ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground group-hover:text-foreground")}>
                        {item.icon}
                        {needsAttention && <span aria-label="Action required" className="absolute -right-1.5 -top-1 size-2 rounded-full border border-card bg-red-500" />}
                      </span>
                      {!collapsed && <><span className="min-w-0 flex-1 break-words">{item.label}</span>{attentionCount > 0 && <span aria-label={`${attentionCount} unread`} className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-bold text-white">{attentionCount > 99 ? "99+" : attentionCount}</span>}</>}
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
  const isStaff = access.workspaces.includes("ops") || access.workspaces.includes("admin");
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
  useEffect(() => {
    if (!menuOpen) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const closeOnWideScreen = () => { if (wide.matches) setMenuOpen(false); };
    closeOnWideScreen();
    wide.addEventListener("change", closeOnWideScreen);
    return () => wide.removeEventListener("change", closeOnWideScreen);
  }, [menuOpen]);
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
    // A hidden tab (or a device left open in the background) doesn't poll;
    // coming back refreshes at once, so another device's activity shows up.
    const onVisible = () => { if (!document.hidden) void load(); };
    window.addEventListener("campushomes:notifications-refresh", refresh);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("campushomes:notifications-refresh", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [notificationsEndpoint, pathname]);

  useEffect(() => {
    const count = unreadNotifications.filter((item) => item.templateKey === "chat.message_received").length;
    baseDocumentTitle.current ??= document.title;
    document.title = count > 0 ? `(${count}) ${baseDocumentTitle.current}` : baseDocumentTitle.current;
    return () => { if (baseDocumentTitle.current) document.title = baseDocumentTitle.current; };
  }, [unreadNotifications]);

  useEffect(() => {
    for (const id of notificationsSeenOn(unreadNotifications, pathname, nav)) markNotificationRead(id);
  }, [pathname, nav, unreadNotifications]);

  function markNotificationRead(id: string) {
    setNotifications((current) => current?.map((item) => (
      item.id === id ? { ...item, readAt: new Date().toISOString() } : item
    )) ?? current);
    void api(`/notifications/${id}/read`, { method: "POST" }).catch(() => {
      // A later poll restores the server state if this optimistic update fails.
    });
  }

  return (
    <div className="min-h-dvh min-w-0 bg-background text-foreground">
      <PresenceHeartbeat />
      <IdleTimeout signInPath={isStaff ? "/staff" : "/sign-in"} />
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-150 lg:block", collapsed ? "w-[64px]" : "w-[var(--ch-sidebar-width)]")}>
        <Sidebar nav={nav} pathname={pathname} collapsed={collapsed} portalLabel={portalLabel} homeHref={homeHref} attentionHrefs={attentionHrefs} attentionCounts={attentionCounts} />
      </aside>
      {menuOpen && <Dialog open aria-label="Workspace navigation" onOpenChange={setMenuOpen} size="sm" className="ch-workspace-nav lg:hidden">
        <Sidebar nav={nav} pathname={pathname} close={() => setMenuOpen(false)} portalLabel={portalLabel} homeHref={homeHref} attentionHrefs={attentionHrefs} attentionCounts={attentionCounts} />
      </Dialog>}

      <div className={cn("min-w-0 transition-[padding] duration-150", collapsed ? "lg:pl-[64px]" : "lg:pl-[var(--ch-sidebar-width)]")}>
        <header className="ch-app-header sticky [@media(max-height:500px)]:static top-0 z-30 flex min-h-17 flex-wrap items-center gap-3 py-2 border-b border-slate-200/90 bg-white/95 px-4 backdrop-blur sm:px-6 dark:border-border dark:bg-background/95">
          <button type="button" aria-label="Open navigation" aria-expanded={menuOpen} aria-haspopup="dialog" onClick={() => setMenuOpen(true)} className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden dark:text-foreground dark:hover:bg-muted"><Menu aria-hidden className="size-5" /></button>
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed(!collapsed)}
            className="hidden min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:grid dark:text-foreground dark:hover:bg-muted"
          >
            {collapsed ? <PanelLeftOpen aria-hidden className="size-4.5" /> : <PanelLeftClose aria-hidden className="size-4.5" />}
          </button>
          {/* Phone: a clear square search button (the squeezed field read as an
              empty box). Tablet and up: the full search field. */}
          <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search the workspace" className="flex size-[44px] shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600 transition-colors hover:border-slate-300 sm:h-10 sm:min-w-0 sm:flex-1 sm:max-w-80 sm:justify-start sm:px-3 sm:text-left sm:text-slate-500 dark:border-border dark:bg-muted dark:text-muted-foreground">
            <Search aria-hidden className="size-5 sm:size-4" /><span className="hidden truncate sm:inline">Search the workspace</span><kbd className="ml-auto hidden rounded border px-1.5 py-0.5 text-xs sm:inline">/</kbd>
          </button>
          <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {headerExtra}
            <ThemeToggle />
            {notificationsEndpoint && (
              <div ref={notifMenuRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={notifOpen}
                  aria-label="Notifications"
                  onClick={() => setNotifOpen((open) => !open)}
                  className="relative grid min-h-[44px] min-w-[44px] place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 dark:text-muted-foreground dark:hover:bg-muted"
                >
                  <Bell aria-hidden className="size-4.5" />
                  {!!unreadNotifications.length && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-red-500" />}
                </button>
                {notifOpen && (
                  <HeaderPanel label="Notifications" onClose={() => setNotifOpen(false)}>
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
                  </HeaderPanel>
                )}
              </div>
            )}
            <div className="hidden h-8 w-px bg-slate-200 sm:block dark:bg-border" />
            <div ref={userMenuRef} className="relative min-w-0 max-w-full">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label="Account settings"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((open) => !open)}
                className="flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-muted"
              >
                <span className="grid size-[32px] shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-900">{initials(user.name)}</span>
                <span className="hidden min-w-0 text-left sm:block"><span className="block max-w-32 truncate text-xs font-bold">{user.name || user.email}</span><span className="block max-w-[220px] break-words text-xs text-slate-500 dark:text-muted-foreground">{portalLabel}</span></span>
                <ChevronDown aria-hidden className={cn("size-3.5 text-slate-400 transition-transform", userMenuOpen && "rotate-180")} />
              </button>
              {userMenuOpen && (
                <HeaderPanel label="Account" className="w-64" onClose={() => setUserMenuOpen(false)}>
                  <div className="border-b border-slate-100 px-4 py-3 dark:border-border">
                    <p className="break-words text-sm font-bold text-slate-900 dark:text-foreground">{user.name || "Unnamed"}</p>
                    {user.username && <p className="break-all text-xs text-teal-700 dark:text-teal-300">{user.username}</p>}
                    {user.email && <p className="break-all text-xs text-slate-500 dark:text-muted-foreground">{user.email}</p>}
                    {user.phoneNumber && <p className="break-all text-xs text-slate-500 dark:text-muted-foreground">{user.phoneNumber}</p>}
                    <p className="mt-1.5 inline-block rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-teal-700 dark:bg-teal-500/15 dark:text-teal-300">{portalLabel}</p>
                  </div>
                  {profileHref && (
                    <Link href={profileHref} onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-foreground dark:hover:bg-muted">
                      <UserRound aria-hidden className="size-4 text-slate-400" />
                      Profile settings
                    </Link>
                  )}
                  {auditLogHref && (
                    <Link href={auditLogHref} onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-foreground dark:hover:bg-muted">
                      <Bell aria-hidden className="size-4 text-slate-400" />
                      Audit log
                    </Link>
                  )}
                  {settingsHref && (
                    <Link href={settingsHref} onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-foreground dark:hover:bg-muted">
                      <Settings aria-hidden className="size-4 text-slate-400" />
                      Settings
                    </Link>
                  )}
                  {canSwitchWorkspace && (
                    <Link href="/choose-workspace" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-foreground dark:hover:bg-muted">
                      <ArrowLeftRight aria-hidden className="size-4 text-slate-400" />
                      Switch workspace
                    </Link>
                  )}
                  <div className="border-t border-border p-2 sm:hidden"><SignOutButton /></div>
                </HeaderPanel>
              )}
            </div>
            <div className="hidden sm:block"><SignOutButton /></div>
          </div>
        </header>
        <main className="mx-auto min-w-0 w-full max-w-[var(--ch-app-max)] px-4 py-5 sm:px-6 sm:py-7 xl:px-8">{children}</main>
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

      {searchOpen && <Dialog open aria-label="Search workspace" onOpenChange={setSearchOpen} size="md">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-3"><Search aria-hidden className="size-5 shrink-0 text-muted-foreground" /><input autoFocus aria-label="Search pages" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages…" className="min-h-14 min-w-0 flex-1 bg-transparent py-3 text-base outline-none" /><button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)} className="grid size-[44px] shrink-0 place-items-center rounded-md hover:bg-muted"><X aria-hidden className="size-4" /></button></div>
        <DialogBody className="p-2">
          {matches.map((item) => <Link key={item.href} href={item.href} onClick={() => setSearchOpen(false)} className="flex min-h-11 flex-wrap items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-muted"><span aria-hidden className="shrink-0 text-primary">{item.icon}</span><span className="min-w-0 flex-1 break-words font-semibold">{item.label}</span>{item.group && <span className="text-xs text-muted-foreground">{item.group}</span>}</Link>)}
          {!matches.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No workspace pages match.</p>}
        </DialogBody>
      </Dialog>}
    </div>
  );
}
