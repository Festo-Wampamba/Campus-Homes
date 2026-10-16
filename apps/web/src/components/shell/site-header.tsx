import { headers } from "next/headers";
import Link from "next/link";

import { getServerSession } from "@/lib/session";
import { WORKSPACE_HOME } from "@/lib/auth-routing";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { AccountMenu } from "@/components/shell/account-menu";
import { MobileNav, type NavLink } from "@/components/shell/mobile-nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Wordmark } from "@/components/shell/wordmark";

// Session-aware even on the marketing pages — a signed-in student browsing
// home/search/listing-detail must see that they're signed in, not just the
// portal pages (session.ts's getServerSession() is safe to call from any
// server component, same helper the portal layouts already use).
const PAGE_LINKS: NavLink[] = [
  { href: "/search", label: "Find a room" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/support", label: "Support" },
];

async function SiteHeader() {
  const session = await getServerSession();
  // Sign-in returns to the page it was opened from (the home page needs no next).
  const path = (await headers()).get("x-campushomes-path") ?? "/";
  const signInHref = path === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(path)}`;
  const hasLandlordAccess = session?.access.workspaces.includes("landlord") ?? false;
  const landlordLink: NavLink = hasLandlordAccess
    ? { href: WORKSPACE_HOME.landlord, label: "Landlord" }
    : { href: "/landlords", label: "For landlords" };

  return (
    <header className="sticky top-0 z-(--z-sticky) h-16 border-b border-border bg-background/95 text-foreground shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="CampusHomes home">
          <Wordmark className="text-[1.08rem] dark:text-white" />
        </Link>
        <nav className="flex items-center gap-1.5 sm:gap-2">
          {PAGE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition duration-300 hover:bg-muted hover:text-foreground md:block"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={landlordLink.href}
            className="hidden whitespace-nowrap rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-foreground transition duration-300 hover:border-teal-600 hover:bg-accent sm:block"
          >
            {landlordLink.label}
          </Link>
          <ThemeToggle />
          {session ? (
            <>
              <PresenceHeartbeat />
              <AccountMenu user={session.user} access={session.access} />
            </>
          ) : (
            <Link
              href={signInHref}
              data-cta="header-sign-in"
              className="inline-flex h-10 items-center whitespace-nowrap rounded-lg border border-teal-900/25 px-4 text-sm font-bold text-teal-900 transition-colors duration-300 hover:border-teal-900 hover:bg-teal-900 hover:text-white sm:px-5 dark:border-border dark:text-foreground"
            >
              Sign in
            </Link>
          )}
          <MobileNav links={[...PAGE_LINKS, landlordLink]} />
        </nav>
      </div>
    </header>
  );
}

export { SiteHeader };
