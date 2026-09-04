"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { University } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { UniversitySelectField } from "@/components/university-select-field";
import { api, ApiError } from "@/lib/api";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

// `needsProfile` = signed-in student has no `students` row yet. Reservations
// FK to students.user_id, so one must exist before a Reserve can be created —
// but that's collected here, inline, on first reserve (one required field)
// rather than redirecting to a separate /profile page before Reserve even
// becomes clickable. Full particulars stay editable later at /profile.
export function ReserveButton({ bedId, needsProfile }: { bedId: string; needsProfile: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProfileStep, setShowProfileStep] = useState(false);
  const [university, setUniversity] = useState<University | "">("");

  async function startReserve() {
    setError(null);
    setPending(true);
    try {
      // Reserve is a 24h temporary claim (§6) — landlord Books it offline,
      // no payment/checkout step here at all.
      await api("/reservations/reserve", {
        method: "POST",
        body: JSON.stringify({ bedId, idempotencyKey: crypto.randomUUID() }),
      });
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
    void startReserve();
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
    await startReserve();
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
            <UniversitySelectField value={university} onChange={setUniversity} autoFocus />
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
