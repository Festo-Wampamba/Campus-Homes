"use client";

import {
  Calendar,
  CalendarCheck,
  Clock3,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  MessageCircle,
  Search,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AccountAccess } from "@campushomes/shared";

import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { IdleTimeout } from "@/components/shell/idle-timeout";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Wordmark } from "@/components/shell/wordmark";
import { Dialog } from "@/components/ui/dialog";
import type { SessionUser } from "@/lib/session";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "Find housing", icon: Search },
  { href: "/reservations", label: "My reservations", icon: CalendarCheck },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/saved", label: "Favourites", icon: Heart },
  { href: "/recently-viewed", label: "Recently viewed", icon: Clock3 },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/support", label: "Support", icon: LifeBuoy },
] as const;

function initials(user: SessionUser) {
  return (user.name || user.email || user.phoneNumber || "CH")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="ch-student-shell__nav" aria-label="Student navigation">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className="ch-student-shell__nav-link" onClick={onNavigate}>
            <Icon aria-hidden className="size-4" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar({ user, pathname, onNavigate }: { user: SessionUser; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="ch-student-shell__sidebar-inner">
      <Link href="/" className="ch-student-shell__brand" onClick={onNavigate}>
        <Wordmark className="text-[1.08rem]" />
        <span className="ml-auto rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700">Student</span>
      </Link>
      <Navigation pathname={pathname} onNavigate={onNavigate} />
      <div className="border-t border-[#edf2f1] pt-4">
        <Link
          href="/profile"
          className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 hover:bg-teal-50"
          onClick={onNavigate}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-900">{initials(user)}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-bold">{user.name || "Student"}</span><span className="block truncate text-xs text-[var(--ch-ink-soft)]">{user.email || user.phoneNumber || "CampusHomes account"}</span></span>
        </Link>
        <div className="mt-2 px-2"><SignOutButton /></div>
      </div>
    </div>
  );
}

export function StudentShell({ children, user }: { children: React.ReactNode; user: SessionUser; access: AccountAccess }) {
  const pathname = usePathname() ?? "";
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="ch-student-shell">
      <aside className="ch-student-shell__sidebar" aria-label="Student workspace">
        <Sidebar user={user} pathname={pathname} />
      </aside>

      <Dialog
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        aria-label="Student navigation"
        className="ch-student-shell__drawer-dialog lg:hidden"
      >
        <div className="ch-student-shell__drawer-heading">
          <span>Student workspace</span>
          <button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-teal-800 hover:bg-teal-50" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}>
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="ch-student-shell__drawer-nav">
          <Sidebar user={user} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
        </div>
      </Dialog>

      <div className="ch-student-shell__main">
        <header className="ch-student-shell__header">
          <button type="button" className="ch-student-shell__menu" aria-label="Open navigation" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
            <Menu aria-hidden className="size-5" />
          </button>
          <Link href="/" className="ch-student-shell__mobile-brand lg:hidden" aria-label="CampusHomes home"><Wordmark className="text-[1.05rem]" /></Link>
          <div className="ml-auto flex items-center gap-2">
            <PresenceHeartbeat />
            {/* Same 10-minute inactivity sign-out as every other signed-in shell (#235). */}
            <IdleTimeout signInPath="/sign-in" />
            <ThemeToggle />
            <Link href="/profile" className="hidden items-center gap-2 rounded-full px-2 py-1 text-sm font-bold hover:bg-teal-50 sm:flex">
              <span className="grid size-8 place-items-center rounded-full bg-teal-100 text-xs text-teal-900">{initials(user)}</span>
              <span className="max-w-28 truncate">{user.name || "Profile"}</span>
            </Link>
            <Link href="/profile" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-teal-800 hover:bg-teal-50 sm:hidden" aria-label="View profile">
              <UserRound aria-hidden className="size-5" />
            </Link>
          </div>
        </header>
        <main className="ch-student-shell__content">{children}</main>
      </div>
    </div>
  );
}
