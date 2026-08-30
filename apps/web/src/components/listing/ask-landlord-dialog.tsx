"use client";

import { useState } from "react";
import { CheckCircle2, MessageCircleQuestion } from "lucide-react";

import type { Inquiry } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { api, apiErrorMessage } from "@/lib/api";

// Pre-reservation channel to the landlord — separate from the per-reservation
// chat thread (which only opens once a hold exists) and from the general
// /support inquiries desk (staff-routed, never reaches the landlord). This
// posts the same `inquiries` row with a listingId, which the server resolves
// to the landlord server-side (see InquiriesService.create).
export function AskLandlordDialog({
  listingId,
  propertyName,
}: {
  listingId: string;
  propertyName: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [wantsViewing, setWantsViewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close(next: boolean) {
    setOpen(next);
    if (!next && sent) {
      // Reset for next time the dialog opens, but only after a successful
      // send — an in-progress draft shouldn't vanish on an accidental close.
      setMessage("");
      setWantsViewing(false);
      setSent(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setPending(true);
    setError(null);
    try {
      await api<Inquiry>("/inquiries", {
        method: "POST",
        body: JSON.stringify({
          category: "listing",
          subject: `${wantsViewing ? "Viewing request" : "Question"} — ${propertyName}`,
          message: message.trim(),
          listingId,
        }),
      });
      setSent(true);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't send your message — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        <MessageCircleQuestion aria-hidden className="size-4" />
        Ask about this place
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogHeader
          title={sent ? "Sent" : "Ask the landlord"}
          description={sent ? undefined : `Goes directly to ${propertyName}'s landlord — no reservation needed.`}
          onClose={() => close(false)}
        />
        <DialogBody>
          {sent ? (
            <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
              <p>
                Sent — the landlord has been notified. You&apos;ll see their reply under
                &ldquo;Your inquiries&rdquo; on the <a href="/support" className="underline">Support page</a>.
              </p>
            </div>
          ) : (
            <form id="ask-landlord-form" onSubmit={submit} className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={wantsViewing}
                  onChange={(e) => setWantsViewing(e.target.checked)}
                  className="size-4 rounded border-input"
                />
                This is a viewing request
              </label>
              <div className="space-y-1.5">
                <label htmlFor="ask-landlord-message" className="text-xs font-semibold text-muted-foreground">
                  {wantsViewing ? "When would you like to view it, and any questions?" : "Your question"}
                </label>
                <textarea
                  id="ask-landlord-message"
                  rows={5}
                  maxLength={4000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    wantsViewing
                      ? "E.g. Is the room still available? I'd like to view this Saturday afternoon."
                      : "E.g. Is water included in the rent?"
                  }
                  className="w-full rounded-lg border border-input bg-background p-3 text-sm"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                For your safety, keep phone numbers and links out of your message — reply and
                follow-up all happen right here on CampusHomes.
              </p>
              {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
            </form>
          )}
        </DialogBody>
        <DialogFooter>
          {sent ? (
            <Button type="button" onClick={() => close(false)}>
              Done
            </Button>
          ) : (
            <Button type="submit" form="ask-landlord-form" disabled={pending || !message.trim()}>
              {pending ? "Sending…" : "Send"}
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    </>
  );
}
