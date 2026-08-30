import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock3, ShieldAlert } from "lucide-react";

import { getServerSession } from "@/lib/session";
import { homeForAuthenticatedRole } from "@/lib/auth-routing";
import { Card, CardContent } from "@/components/ui/card";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { Wordmark } from "@/components/shell/wordmark";

export const metadata: Metadata = { title: "Account pending" };

// Landing page for a session whose account isn't active yet — a self-
// registered landlord awaiting ops review (status: pending), or an account
// an ops lead/admin has suspended. Better Auth's own sign-in doesn't check
// `status` (that's our custom column), so a pending/suspended user can still
// get a session cookie; every real API call then hits AuthGuard's
// "This account is not active" 401. This page is what the sign-in form
// routes them to instead of their normal portal, so that 401 never has to
// surface as a broken dashboard.
export default async function AccountPendingPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");
  if (session.user.status === "active") redirect(homeForAuthenticatedRole(session.user.role));

  const suspended = session.user.status === "suspended";

  return (
    <div className="relative flex h-dvh w-full items-center justify-center bg-gradient-to-br from-teal-700 via-teal-800 to-teal-950 p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
          <Wordmark stacked />
          <span
            className={
              suspended
                ? "flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                : "flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }
          >
            {suspended ? <ShieldAlert aria-hidden className="size-6" /> : <Clock3 aria-hidden className="size-6" />}
          </span>
          <div>
            <p className="font-display text-lg font-semibold text-foreground">
              {suspended ? "Account suspended" : "Your account is awaiting approval"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {suspended
                ? "An ops lead has suspended this account. Contact support if you believe this is a mistake."
                : "An ops lead reviews new landlord accounts before they can sign in. You'll be able to sign in normally once yours is approved — no need to do anything else in the meantime."}
            </p>
          </div>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
