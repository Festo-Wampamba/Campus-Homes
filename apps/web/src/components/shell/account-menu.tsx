"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock, Heart, LayoutDashboard, User as UserIcon } from "lucide-react";

import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/shell/sign-out-button";

const menuItemClass =
  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted";

export function AccountMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isStudent = user.role === "student";
  const isLandlord = user.role === "landlord";
  const isStaff = user.role === "ops_lead" || user.role === "ops_inspector" || user.role === "admin";
  const displayName = user.name?.trim() || user.phoneNumber || user.email || "Account";

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-28 truncate sm:inline">{displayName}</span>
        <ChevronDown aria-hidden className={cn("size-4 text-muted-foreground transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-(--z-dropdown) mt-2 w-56 rounded-md border border-border bg-card p-1.5 shadow-md"
        >
          {isStudent && (
            <>
              <Link role="menuitem" href="/reservations" className={menuItemClass} onClick={() => setOpen(false)}>
                <UserIcon aria-hidden className="size-4 text-muted-foreground" />
                My reservations
              </Link>
              <Link role="menuitem" href="/saved" className={menuItemClass} onClick={() => setOpen(false)}>
                <Heart aria-hidden className="size-4 text-muted-foreground" />
                Favourites
              </Link>
              <Link role="menuitem" href="/recently-viewed" className={menuItemClass} onClick={() => setOpen(false)}>
                <Clock aria-hidden className="size-4 text-muted-foreground" />
                Recently viewed
              </Link>
              <Link role="menuitem" href="/profile" className={menuItemClass} onClick={() => setOpen(false)}>
                Profile
              </Link>
            </>
          )}
          {isLandlord && (
            <Link role="menuitem" href="/landlord" className={menuItemClass} onClick={() => setOpen(false)}>
              <LayoutDashboard aria-hidden className="size-4 text-muted-foreground" />
              Dashboard
            </Link>
          )}
          {isStaff && (
            <Link role="menuitem" href="/ops" className={menuItemClass} onClick={() => setOpen(false)}>
              <LayoutDashboard aria-hidden className="size-4 text-muted-foreground" />
              Ops portal
            </Link>
          )}
          <div className="my-1 h-px bg-border" />
          <div className="px-1">
            <SignOutButton />
          </div>
        </div>
      )}
    </div>
  );
}
