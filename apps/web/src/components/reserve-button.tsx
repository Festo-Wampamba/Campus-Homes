"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UNIVERSITIES, type University } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const UNIVERSITY_LABELS: Record<University, string> = {
  MUK: "Makerere University (MUK)",
  MUBS: "Makerere University Business School (MUBS)",
  KIU: "Kampala International University (KIU)",
  KYU: "Kyambogo University (KYU)",
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

// `needsProfile` = signed-in student has no `students` row yet. Reservations
// FK to students.user_id, so one must exist before a hold can be created —
// but that's collected here, inline, on first reserve (one required field)
// rather than redirecting to a separate /profile page before Reserve even
// becomes clickable. Full particulars stay editable later at /profile.
export function ReserveButton({ unitId, needsProfile }: { unitId: string; needsProfile: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProfileStep, setShowProfileStep] = useState(false);
  const [university, setUniversity] = useState<University | "">("");

  async function startHold() {
    setError(null);
    setPending(true);
    try {
      // checkoutUrl is only set on the paid path (RESERVATION_FEE_UGX > 0
      // via platform_settings) — the Phase 1 default is a free reservation,
      // already 'fulfilled' by the time this call returns, nothing to pay.
      const { checkoutUrl } = await api<{ checkoutUrl: string | null }>("/reservations/holds", {
        method: "POST",
        body: JSON.stringify({ unitId, idempotencyKey: crypto.randomUUID() }),
      });
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      router.push("/reservations");
    } catch (err) {
      setError(errorMessage(err, "Couldn't start your reservation — try again."));
      setPending(false);
    }
  }

  function reserve() {
    if (needsProfile) {
      setError(null);
      setShowProfileStep(true);
      return;
    }
    void startHold();
  }

  async function submitProfileAndReserve(e: React.FormEvent) {
    e.preventDefault();
    if (!university) return;
    setError(null);
    setPending(true);
    try {
      await api("/students/profile", {
        method: "POST",
        body: JSON.stringify({ university, yearOfStudy: null }),
      });
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your university — try again."));
      setPending(false);
      return;
    }
    setShowProfileStep(false);
    await startHold();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" disabled={pending} onClick={reserve}>
        {pending ? "Starting…" : "Reserve"}
      </Button>
      {error && (
        <p role="status" className="max-w-40 text-right text-xs text-destructive">
          {error}
        </p>
      )}
      <Dialog open={showProfileStep} onOpenChange={setShowProfileStep}>
        <DialogHeader
          title="Just one thing first"
          description="Which university are you at? This finishes setting up your student account — you only need to do it once."
          onClose={() => setShowProfileStep(false)}
        />
        <DialogBody>
          <form id="reserve-profile-form" onSubmit={submitProfileAndReserve} className="space-y-3">
            <select
              required
              autoFocus
              value={university}
              onChange={(e) => setUniversity(e.target.value as University)}
              className={cn(
                "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
                "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <option value="" disabled>
                Select your university
              </option>
              {UNIVERSITIES.map((id) => (
                <option key={id} value={id}>
                  {UNIVERSITY_LABELS[id]}
                </option>
              ))}
            </select>
            {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="submit" form="reserve-profile-form" disabled={pending || !university}>
            {pending ? "Reserving…" : "Continue and reserve"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
