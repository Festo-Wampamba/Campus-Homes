"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { signInUrl } from "@/lib/auth";

/** Shown when a signed-out visitor presses Reserve. Sign-up (or sign-in)
 * returns them to `next`, the listing with the room they picked. */
export function SignUpToReserveDialog({
  open,
  onOpenChange,
  next,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  next: string;
}) {
  return (
    <Dialog aria-label="Create an account to reserve" open={open} onOpenChange={onOpenChange} size="sm">
      <DialogHeader
        title="Create an account to reserve"
        description="Reserving a room needs a free student account, so the landlord knows who is coming and you can follow your reservation. It takes a minute, and you come straight back to this room."
        onClose={() => onOpenChange(false)}
      />
      <DialogBody>
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <a
            href={signInUrl("consumer", next, "student")}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            Sign in
          </a>
        </p>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <a href={signInUrl("consumer", next, "student", "register")} className={buttonVariants()}>
          Sign up
        </a>
      </DialogFooter>
    </Dialog>
  );
}
