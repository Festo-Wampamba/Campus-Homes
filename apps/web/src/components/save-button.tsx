"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { signInUrl } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** Heart toggle for a listing. Signed-out visitors (`signedOut`) see the same
 * heart, but pressing it explains that saving needs a free student account,
 * the same as reserving, and returns them to this listing afterwards. */
export function SaveButton({
  listingId,
  initialSaved = false,
  signedOut = false,
}: {
  listingId: string;
  initialSaved?: boolean;
  signedOut?: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const [askToSignIn, setAskToSignIn] = useState(false);

  async function toggle() {
    if (signedOut) {
      setAskToSignIn(true);
      return;
    }
    setPending(true);
    const next = !saved;
    setSaved(next); // optimistic — a failed toggle isn't worth blocking on
    try {
      if (next) {
        await api("/students/saved-listings", {
          method: "POST",
          body: JSON.stringify({ listingId }),
        });
      } else {
        await api(`/students/saved-listings/${listingId}`, { method: "DELETE" });
      }
    } catch {
      setSaved(!next); // roll back on failure
    } finally {
      setPending(false);
    }
  }

  const back = `/listings/${listingId}`;
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={signedOut ? undefined : saved}
        aria-label={saved ? "Remove from favourites" : "Save to favourites"}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-xs transition-colors duration-150 hover:bg-muted disabled:opacity-60"
      >
        <Heart
          aria-hidden
          className={cn("size-4", saved ? "fill-coral-500 text-coral-500" : "text-muted-foreground")}
        />
        {saved ? "Saved" : "Save"}
      </button>
      {signedOut && (
        <Dialog open={askToSignIn} onOpenChange={setAskToSignIn} size="sm">
          <DialogHeader
            title="Create an account to save favourites"
            description="Favourite hostels are kept in your free student account, the same account you use to reserve a room. It takes a minute, and you come straight back here."
            onClose={() => setAskToSignIn(false)}
          />
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              Already have an account? Sign in, then press the heart again.
            </p>
          </DialogBody>
          <DialogFooter>
            <a href={signInUrl("consumer", back, "student")} className={buttonVariants({ variant: "secondary" })}>
              Sign in
            </a>
            <a href={signInUrl("consumer", back, "student", "register")} className={buttonVariants()}>
              Create free account
            </a>
          </DialogFooter>
        </Dialog>
      )}
    </>
  );
}
