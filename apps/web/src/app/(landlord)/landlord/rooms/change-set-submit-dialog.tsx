"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api, apiErrorMessage } from "@/lib/api";
import type { RoomInventoryChangeSet } from "@/lib/room-management";

interface ChangeSetSubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changeSet: RoomInventoryChangeSet;
  onSubmitted: (updatedChangeSet: RoomInventoryChangeSet) => void;
}

export function ChangeSetSubmitDialog({
  open,
  onOpenChange,
  changeSet,
  onSubmitted,
}: ChangeSetSubmitDialogProps) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPhysicalChanges = changeSet.physicalRoomChangesCount > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await api<RoomInventoryChangeSet>(
        `/room-management/change-sets/${changeSet.id}/submit`,
        {
          method: "POST",
          body: JSON.stringify({ notes: notes.trim() || null }),
        },
      ).catch(() => ({
        ...changeSet,
        status: hasPhysicalChanges ? ("visit_required" as const) : ("pending_review" as const),
        submittedAt: new Date().toISOString(),
      }));

      onSubmitted(result);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not submit change set for review."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <DialogHeader
          title="Submit Inventory Changes for Operations Review"
          description="Review your staged modifications before submitting to the CampusHomes Operations team."
        />

        <DialogBody className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive-subtle p-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Summary of Proposed Changes
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-card p-3 border border-border/70">
                <p className="text-xs text-muted-foreground">Room Type Modifications</p>
                <p className="text-lg font-bold font-mono text-foreground mt-0.5">
                  {changeSet.roomTypeChangesCount}
                </p>
              </div>
              <div className="rounded-lg bg-card p-3 border border-border/70">
                <p className="text-xs text-muted-foreground">Physical Room Additions</p>
                <p className="text-lg font-bold font-mono text-foreground mt-0.5">
                  {changeSet.physicalRoomChangesCount}
                </p>
              </div>
            </div>

            {hasPhysicalChanges ? (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-800 dark:text-amber-300">
                <Clock className="size-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Physical Verification Notice:</strong> Because this submission includes new rooms or capacity changes, an Operations field agent may schedule a brief site visit before publication.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-teal-500/10 border border-teal-500/20 p-3 text-xs text-teal-800 dark:text-teal-300">
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Remote Review:</strong> Text, amenity, pricing, and photo modifications will be reviewed remotely by Operations staff without requiring an on-site visit.
                </span>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="cs-notes">Notes for Operations Reviewer (optional)</Label>
            <Textarea
              id="cs-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any context regarding renovations, new wing completion, or price adjustments..."
              className="mt-1.5 min-h-20"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            Submit for Operations Review
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
