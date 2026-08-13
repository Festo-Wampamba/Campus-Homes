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
    <header className="sticky top-0 z-(--z-sticky) h-16 border-b border-border bg-background/95 text-foreground shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="CampusHomes home">
          <Wordmark className="text-[1.08rem] dark:text-white" />
        </Link>
        <nav className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/search"
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition duration-300 hover:bg-muted hover:text-foreground md:block"
          >
            Find a room
          </Link>
          <Link
            href="/#how-it-works"
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition duration-300 hover:bg-muted hover:text-foreground md:block"
          >
            How it works
          </Link>
          <Link
            href="/#landlords"
            className="hidden whitespace-nowrap rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-foreground transition duration-300 hover:border-teal-600 hover:bg-accent sm:block"
          >
            List a property
          </Link>
          <ThemeToggle />
          {session ? (
            <AccountMenu user={session.user} />
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex h-10 items-center whitespace-nowrap rounded-lg bg-coral-500 px-4 text-sm font-bold text-teal-900 transition duration-300 hover:bg-coral-600 hover:text-white active:scale-[0.98] sm:px-5"
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
