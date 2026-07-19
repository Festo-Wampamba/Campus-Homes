import Link from "next/link";

import { getServerSession } from "@/lib/session";
import { AccountMenu } from "@/components/shell/account-menu";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Wordmark } from "@/components/shell/wordmark";

// Session-aware even on the marketing pages — a signed-in student browsing
// home/search/listing-detail must see that they're signed in, not just the
// portal pages (session.ts's getServerSession() is safe to call from any
// server component, same helper the portal layouts already use).
async function SiteHeader() {
  const session = await getServerSession();

  return (
    <header className="sticky top-0 z-(--z-sticky) border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="CampusHomes home">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/#how-it-works"
            className="hidden rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            How it works
          </Link>
          <Link
            href="/#landlords"
            className="hidden whitespace-nowrap rounded-md px-2 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:block sm:px-3"
          >
            For landlords
          </Link>
          <ThemeToggle />
          {session ? (
            <AccountMenu user={session.user} />
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex h-9 items-center whitespace-nowrap rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700 sm:px-4"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export { SiteHeader };
