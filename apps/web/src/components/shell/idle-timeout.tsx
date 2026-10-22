"use client";

import { useCallback } from "react";
import { IDLE_TIMEOUT_MS } from "@campushomes/shared";

import { signOut } from "@/lib/auth";
import { IDLE_SIGN_OUT_EVENT, idleSignInUrl, useIdleTimeout, type IdleExpiry } from "@/lib/idle-timeout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";

/** Inactivity sign-out for every signed-in shell. Escape or a backdrop click
 * also means someone is there, so they keep the session too. */
export function IdleTimeout({ signInPath }: { signInPath: "/sign-in" | "/staff" }) {
  const onExpire = useCallback((reason: IdleExpiry) => {
    const url = idleSignInUrl(signInPath, reason, `${window.location.pathname}${window.location.search}`);
    // Our session only: the next sign-in always asks for credentials again
    // (prompt=login, plus max_age=0 for staff), so the Logto session can't
    // sign anyone back in silently. Offline queues (IndexedDB) are untouched.
    window.dispatchEvent(new Event(IDLE_SIGN_OUT_EVENT));
    void signOut().catch(() => undefined).finally(() => window.location.assign(url));
  }, [signInPath]);
  const { secondsLeft, staySignedIn } = useIdleTimeout(onExpire);

  return (
    <Dialog open={secondsLeft !== null} onOpenChange={(open) => { if (!open) staySignedIn(); }} size="sm">
      <DialogBody>
        <h2 className="font-display text-lg font-bold text-foreground">
          You&apos;ll be signed out in {secondsLeft} s
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          For your security, CampusHomes signs you out after {IDLE_TIMEOUT_MS / 60_000} minutes without activity.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button type="button" onClick={staySignedIn}>Stay signed in</Button>
      </DialogFooter>
    </Dialog>
  );
}
