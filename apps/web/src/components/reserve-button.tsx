"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { University } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { UniversitySelectField } from "@/components/university-select-field";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatUgx } from "@/lib/format";

type Reserved = { id: string; reservedAt: string | null; reservedExpiresAt: string | null };

function holdHours(reserved: Reserved): number | null {
  if (!reserved.reservedAt || !reserved.reservedExpiresAt) return null;
  return Math.round((Date.parse(reserved.reservedExpiresAt) - Date.parse(reserved.reservedAt)) / 3_600_000);
}

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
export function ReserveButton({
  bedId,
  listingId,
  needsProfile,
  propertyName,
  roomLabel,
  priceUgx,
  depositUgx,
}: {
  bedId: string;
  listingId: string;
  needsProfile: boolean;
  propertyName: string;
  roomLabel: string;
  priceUgx?: number;
  depositUgx?: number | null;
}) {
  const router = useRouter();
  const [review, setReview] = useState(false);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProfileStep, setShowProfileStep] = useState(false);
  const [university, setUniversity] = useState<University | "">("");
  const [reserved, setReserved] = useState<Reserved | null>(null);

  async function startReserve() {
    setError(null);
    setPending(true);
    try {
      // Reserve is a temporary claim (§6) — landlord Books it offline,
      // no payment/checkout step here at all.
      // The hold length is read from the response, not assumed: admins can
      // change reservation_hold_hours.
      const result = await api<Reserved>("/reservations/reserve", {
        method: "POST",
        body: JSON.stringify({ bedId, listingId, idempotencyKey: crypto.randomUUID() }),
      });
      setReserved(result);
      setPending(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn't start your reservation. Try again."));
      setPending(false);
    }
  }

  function reserve() {
    if (needsProfile && !profileCompleted) {
      setError(null);
      setShowProfileStep(true);
      return;
    }
    setReview(true);
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
      setError(errorMessage(err, "Couldn't save your university. Try again."));
      setPending(false);
      return;
    }
    setShowProfileStep(false);
    setProfileCompleted(true);
    setPending(false);
    setReview(true);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" className="min-h-11 w-full" disabled={pending} onClick={reserve}>
        {pending ? "Starting…" : "Reserve for free"}
      </Button>
      <Dialog aria-label="Review your free reservation" open={review} onOpenChange={setReview}>
        <DialogHeader title="Review your free reservation" description={`${propertyName} · ${roomLabel}`} onClose={() => setReview(false)} />
        <DialogBody><div className="space-y-4 text-base">
          {priceUgx !== undefined && <p className="font-semibold">{formatUgx(priceUgx)} per bed, per semester</p>}
          <p>Deposit: {depositUgx == null ? "unstated — confirm with the landlord" : formatUgx(depositUgx)}.</p>
          <p>This temporarily holds an available bed within your selected room category. A specific numbered room is allocated by the landlord.</p>
          <p className="text-muted-foreground">No payment is taken. Review the property’s charges and house rules, then agree rent, payment timing and tenancy terms directly with the landlord. The confirmation will show your actual expiry.</p>
        </div></DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => setReview(false)}>Go back</Button><Button disabled={pending} onClick={() => { setReview(false); void startReserve(); }}>Confirm free reservation</Button></DialogFooter>
      </Dialog>
      {/* A popup, not a line squeezed under the button: the message (e.g. the
          5-reservation limit) is long. Errors from the university step stay
          inside that dialog instead. */}
      <Dialog aria-label="Reservation error" open={!!error && !showProfileStep} onOpenChange={(open) => !open && setError(null)} size="sm">
        <DialogHeader title="Couldn't reserve this room" onClose={() => setError(null)} />
        <DialogBody>
          <p role="alert" className="text-sm text-foreground">{error}</p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={() => setError(null)}>
            OK
          </Button>
        </DialogFooter>
      </Dialog>
      <Dialog aria-label="Complete your student profile" open={showProfileStep} onOpenChange={setShowProfileStep}>
        <DialogHeader
          title="Just one thing first"
          description="Which university are you at? This finishes setting up your student account. You only need to do it once."
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
            {pending ? "Reserving…" : "Continue to review"}
          </Button>
        </DialogFooter>
      </Dialog>
      <Dialog
        aria-label="Reservation confirmation"
        open={reserved !== null}
        onOpenChange={(open) => {
          if (open) return;
          setReserved(null);
          // The bed just left the available pool; re-read the room list.
          router.refresh();
        }}
      >
        {reserved && (
          <>
            <DialogHeader
              title="Room reserved for you"
              description={`${propertyName} · ${roomLabel}`}
              onClose={() => {
                setReserved(null);
                router.refresh();
              }}
            />
            <DialogBody>
              <div className="space-y-3 text-sm text-foreground">
                {reserved.reservedExpiresAt && (
                  <p className="rounded-lg bg-teal-50 p-3 font-semibold text-teal-900">
                    {holdHours(reserved) !== null
                      ? `We're holding this room for you for ${holdHours(reserved)} hours, until ${formatDateTime(reserved.reservedExpiresAt)}.`
                      : `We're holding this room for you until ${formatDateTime(reserved.reservedExpiresAt)}.`}
                  </p>
                )}
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>Contact the landlord to view the room and agree rent and terms.</li>
                  <li>Once you agree, tap Request booking in My reservations. The landlord confirms it; pay them directly, not through CampusHomes.</li>
                  <li>If nothing is confirmed before the hold ends, the room is released for other students.</li>
                </ol>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setReserved(null);
                  router.refresh();
                }}
              >
                Keep browsing
              </Button>
              <Button type="button" onClick={() => router.push(`/reservations?new=${reserved.id}`)}>
                View my reservations
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </div>
  );
}
