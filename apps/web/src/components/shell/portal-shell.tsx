import Link from "next/link";

import type { SessionUser } from "@/lib/session";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { Wordmark } from "@/components/shell/wordmark";
import { cn } from "@/lib/utils";

export interface PortalNavItem {
  label: string;
  href: string;
}

/**
 * One shell for all three portals — portals differ by nav items and density,
 * not by dialect (PRODUCT.md principle 4).
 */
function PortalShell({
  portalLabel,
  nav,
  user,
  children,
}: {
  portalLabel: string;
  nav: PortalNavItem[];
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-(--z-sticky) border-b border-border bg-background">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="CampusHomes home">
            <Wordmark />
          </Link>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
            {portalLabel}
          </span>
          <nav className="ml-auto flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-border">
        <p className="mx-auto w-full max-w-6xl px-4 py-3 text-xs text-muted-foreground sm:px-6">
          Signed in as {user.name ?? user.phoneNumber ?? user.email} ·{" "}
          {portalLabel}
        </p>
      </footer>
    </div>
  );
}

export { PortalShell };
