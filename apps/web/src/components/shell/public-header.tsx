"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AccountAccess } from "@campushomes/shared";

import type { SessionUser } from "@/lib/session";
import { AccountMenu } from "@/components/shell/account-menu";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { IdleTimeout } from "@/components/shell/idle-timeout";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Wordmark } from "@/components/shell/wordmark";
import { Dialog } from "@/components/ui/dialog";

export type PublicHeaderLink = { href: string; label: string };

export function PublicHeader({
  isHome: initialIsHome,
  signInHref,
  landlordLink,
  session,
  access,
}: {
  isHome: boolean;
  signInHref: string;
  landlordLink: PublicHeaderLink;
  session: SessionUser | null;
  access: AccountAccess | null;
}) {
  // Layouts persist across client navigation. Server request headers describe
  // the original request, so route-dependent styling must follow the client.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isHome = pathname ? pathname === "/" : initialIsHome;
  const hasHero = isHome || pathname === "/landlords" || pathname === "/contact" || pathname === "/how-it-works" || pathname === "/support";
  const query = searchParams?.toString();
  const currentPath = `${pathname}${query ? `?${query}` : ""}`;
  const currentSignInHref = pathname ? (isHome ? "/sign-in" : `/sign-in?next=${encodeURIComponent(currentPath)}`) : signInHref;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const links: PublicHeaderLink[] = [
    { href: "/search", label: "Find a room" },
    { ...landlordLink, label: landlordLink.href === "/landlords" ? "For Landlords" : landlordLink.label },
    { href: "/how-it-works", label: "How it works" },
    { href: "/contact", label: "Contact Us" },
    { href: "/support", label: "Support" },
  ];

  useEffect(() => {
    if (!hasHero) return;
    const onScroll = () => setScrolled(window.scrollY > 28);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasHero, pathname]);

  const headerClass = [
    "ch-public-header",
    hasHero ? "ch-public-header--hero" : "",
    scrolled ? "ch-public-header--scrolled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={headerClass}>
      <div className="ch-public-header__inner">
        <Link href="/" className="inline-flex min-h-11 items-center" aria-label="CampusHomes home" onClick={() => setOpen(false)}>
          <Wordmark className={hasHero && !scrolled ? "text-white" : ""} onDark={hasHero && !scrolled} />
        </Link>

        <nav className="ch-public-header__nav" aria-label="Main navigation">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="ch-public-header__link" aria-current={pathname === link.href ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
          <ThemeToggle />
          {session && access ? (
            <>
              <PresenceHeartbeat />
              {/* Browsing public pages while signed in is activity too; without this
                  a student searching for 5+ minutes was signed out with no warning. */}
              <IdleTimeout signInPath={access.workspaces.includes("ops") || access.workspaces.includes("admin") ? "/staff" : "/sign-in"} />
              <AccountMenu user={session} access={access} />
            </>
          ) : (
            <Link
              href={currentSignInHref}
              data-cta="header-sign-in"
              data-public-desktop="true"
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full border border-current px-4 text-sm font-bold transition duration-150 hover:bg-current/10"
            >
              Sign in
            </Link>
          )}

          <button
            type="button"
            className="ch-public-header__menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </nav>
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        aria-label="Mobile navigation"
        className="ch-public-header__menu-dialog lg:hidden"
      >
        <div className="ch-public-header__menu-dialog-inner">
          <div className="ch-public-header__menu-dialog-heading">
            <span>CampusHomes</span>
            <button
              type="button"
              className="ch-public-header__menu-close"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <nav className="ch-public-header__menu-panel" aria-label="Mobile navigation">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="ch-public-header__menu-item" onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            ))}
            {!session && (
              <Link href={currentSignInHref} className="ch-public-header__menu-item" onClick={() => setOpen(false)}>
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </Dialog>
    </header>
  );
}
