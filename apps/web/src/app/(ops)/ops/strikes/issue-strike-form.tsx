"use client";

import { useState } from "react";
import { STRIKE_REASONS, type StrikeReason } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const REASON_LABEL: Record<StrikeReason, string> = {
  no_show: "No-show for a scheduled visit",
  price_mismatch: "Price mismatch vs. listing",
  amenity_fraud: "Amenity fraud",
  abusive: "Abusive behavior",
  other: "Other",
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function IssueStrikeForm() {
  const [landlordId, setLandlordId] = useState("");
  const [reason, setReason] = useState<StrikeReason | "">("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!landlordId || !reason) return;
    setError(null);
    setPending(true);
    try {
      await api("/ops/strikes", {
        method: "POST",
        body: JSON.stringify({ landlordId, reason, notes: notes || undefined }),
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't issue the strike — try again."));
      setPending(false);
    }
  }

  if (done) {
    return <p className="text-sm text-success">Strike issued.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="landlordId" required>Landlord ID</Label>
        <Input
          id="landlordId"
          required
          value={landlordId}
          onChange={(e) => setLandlordId(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reason" required>Reason</Label>
        <select
          id="reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value as StrikeReason)}
          className={cn(
            "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
            "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
          )}
        >
          <option value="" disabled>
            Select a reason
          </option>
          {STRIKE_REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Issuing…" : "Issue strike"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
