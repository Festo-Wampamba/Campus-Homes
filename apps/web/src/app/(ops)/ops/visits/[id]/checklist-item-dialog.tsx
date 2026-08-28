"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VerificationChecklistComponent, VisitCorrection } from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { StatusChip } from "@/components/status-chip";
import { Textarea } from "@/components/ui/textarea";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function ChecklistItemDialog({
  visitId,
  component,
  label,
  entry,
  photoStorageKeys,
  corrections,
  trigger,
}: {
  visitId: string;
  component: VerificationChecklistComponent;
  label: string;
  entry: { passed: boolean; notes?: string } | undefined;
  photoStorageKeys: string[];
  corrections: VisitCorrection[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCorrection = corrections.find((c) => c.status === "open");

  async function send() {
    if (!message.trim()) return;
    setPending(true);
    setError(null);
    try {
      await api(`/ops/visits/${visitId}/corrections`, {
        method: "POST",
        body: JSON.stringify({ component, message: message.trim() }),
      });
      setMessage("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't send this back — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full text-left">
        {trigger}
      </button>
      <Dialog open={open} onOpenChange={setOpen} size="md">
        <DialogHeader title={label} onClose={() => setOpen(false)} />
        <DialogBody className="space-y-4">
          {entry && (
            <div className="flex items-center gap-2">
              <StatusChip tone={entry.passed ? "success" : "destructive"}>
                {entry.passed ? "Pass" : "Fail"}
              </StatusChip>
            </div>
          )}
          {entry?.notes && <p className="text-sm text-foreground">{entry.notes}</p>}
          {!entry?.notes && (
            <p className="text-sm text-muted-foreground">No notes recorded by the inspector.</p>
          )}

          {component === "photos" && (
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Photos</p>
              {photoStorageKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">No photos captured.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {photoStorageKeys.map((key) => {
                    const url = listingPhotoUrl(key, 400);
                    return (
                      <div key={key} className="overflow-hidden rounded-md border border-border">
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL
                          <img src={url} alt="" className="aspect-square w-full object-cover" />
                        ) : (
                          <div className="grid aspect-square place-items-center bg-muted text-xs text-muted-foreground">
                            No preview
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {corrections.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">Correction history</p>
              {corrections.map((c) => (
                <div key={c.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <StatusChip tone={c.status === "open" ? "warning" : "success"}>
                      {c.status === "open" ? "Waiting on inspector" : "Resolved"}
                    </StatusChip>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.raisedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground">{c.message}</p>
                </div>
              ))}
            </div>
          )}

          {!openCorrection && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">Send back to inspector</p>
              <Textarea
                placeholder="What needs fixing?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {!openCorrection && (
            <Button type="button" disabled={pending || !message.trim()} onClick={send}>
              {pending ? "Sending…" : "Send back to inspector"}
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    </>
  );
}
