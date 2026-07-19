"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import type { SessionUser } from "@/lib/session";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Wordmark } from "@/components/shell/wordmark";
import { cn } from "@/lib/utils";

export interface SidebarNavItem {
  label: string;
  href: string;
  // A rendered element, not a component reference — nav is built in a
  // Server Component layout and passed down to this Client Component, and
  // only serializable values (including pre-rendered JSX) survive that
  // boundary; a raw component reference like `icon: Building2` doesn't.
  icon: React.ReactNode;
}

/** The active nav item is whichever nav href matches the current path most
 * specifically — pathname equal to href, or nested under it — rather than
 * any href that happens to prefix the path. Without this, a root item like
 * "/ops" would light up for every sub-route ("/ops/landlords" etc.) instead
 * of just its own. */
function activeHref(pathname: string, nav: SidebarNavItem[]): string | null {
  let best: string | null = null;
  for (const item of nav) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}

function NavLinks({ nav, pathname, onNavigate }: { nav: SidebarNavItem[]; pathname: string; onNavigate?: () => void }) {
  const active = activeHref(pathname, nav);
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={item.href === active ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
            item.href === active
              ? "bg-accent text-teal-700"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Sidebar + topbar + footer shell — used by any portal with enough
 * destinations to want a persistent side nav (ops/admin, landlord). Distinct
 * from PortalShell (student's simpler top-nav-only shell). */
function SidebarShell({
  portalLabel,
  nav,
  user,
  headerExtra,
  children,
}: {
  portalLabel: string;
  nav: SidebarNavItem[];
  user: SessionUser;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-(--z-sticky) border-b border-border bg-background">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((o) => !o)}
            className="-ml-1.5 flex size-11 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden"
          >
            {mobileNavOpen ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
          </button>
          <Link href="/" aria-label="CampusHomes home">
            <Wordmark />
          </Link>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
            {portalLabel}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {headerExtra}
            <ThemeToggle />
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground sm:inline">
              {user.name ?? user.phoneNumber ?? user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* `fixed`, not `sticky` — pinned to the viewport regardless of
            scroll or any ancestor's layout, so it can never visibly "move"
            with the page. `main` gets a matching md:ml-60 since this takes
            the aside out of the flex flow entirely. */}
        <aside className="fixed top-14 bottom-0 left-0 hidden w-60 overflow-y-auto border-r border-border bg-background p-4 md:block">
          <NavLinks nav={nav} pathname={pathname} />
        </aside>

        {mobileNavOpen && (
          <div className="fixed inset-0 top-14 z-(--z-overlay) md:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative w-64 max-w-[80vw] border-r border-border bg-background p-4 shadow-lg">
              <NavLinks nav={nav} pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8 md:ml-60">{children}</main>
      </div>

      <footer className="border-t border-border md:pl-60">
        <p className="px-4 py-3 text-xs text-muted-foreground sm:px-6 lg:px-8">
          Signed in as {user.name ?? user.phoneNumber ?? user.email} · {portalLabel}
        </p>
      </footer>
    </div>
  );
}

export { SidebarShell };
