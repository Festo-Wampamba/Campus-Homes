import { ActivityLogIcon, DashboardIcon } from "@radix-ui/react-icons";
import type { AccountAccess } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { SignInCard } from "@/components/sign-in-card";
import { Wordmark } from "@/components/shell/wordmark";
import { signInUrl } from "@/lib/auth";

import { ErrorNotice, TermsNote } from "../sign-in/sign-in-form";

export function isStaffPath(path: string | null): path is string {
  return !!path && /^\/(admin|ops)(?=[/?#]|$)/.test(path);
}

// Only an already-verified staff session skips the page. Anyone else signed in
// (e.g. as a landlord) must still reach the buttons: the callback replaces the
// browser's session with the staff account.
export function hasVerifiedStaffSession(access: AccountAccess): boolean {
  return access.assurance.mfaVerified && access.workspaces.some((w) => w === "admin" || w === "ops");
}

export function StaffSignIn({ next, error }: { next: string | null; error?: string | null }) {
  const staffNext = isStaffPath(next) ? next : undefined;

  return (
    <SignInCard>
        <div className="mb-3 flex flex-col items-center gap-1 sm:mb-4">
          <Wordmark stacked />
        </div>
        <p className="mb-6 text-center text-sm leading-6 text-muted-foreground">
          Staff sign-in. Use your invited company account and complete two-step verification.
        </p>
        <ErrorNotice error={error} />
        <div className="grid gap-3">
          <a href={signInUrl("staff", staffNext?.startsWith("/admin") ? staffNext : "/admin", "staff")} className="block">
            <Button type="button" className="w-full gap-2 active:-translate-y-px">
              <DashboardIcon aria-hidden />
              Administration
            </Button>
          </a>
          <a href={signInUrl("staff", staffNext?.startsWith("/ops") ? staffNext : "/ops", "staff")} className="block">
            <Button type="button" variant="secondary" className="w-full gap-2 active:-translate-y-px">
              <ActivityLogIcon aria-hidden />
              Operations
            </Button>
          </a>
        </div>
        <TermsNote />
    </SignInCard>
  );
}
