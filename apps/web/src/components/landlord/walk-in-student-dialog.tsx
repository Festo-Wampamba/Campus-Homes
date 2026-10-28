"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { UNIVERSITIES, type University } from "@campushomes/shared";

import type { WalkInBed } from "@/app/(landlord)/landlord/bookings/room-lookup";
import { PAYMENT_METHOD_LABEL } from "@/components/landlord/confirm-booking-dialog";
import { UNIVERSITY_LABELS } from "@/components/university-select-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { api, apiErrorMessage } from "@/lib/api";
import { formatUgx, roomCategoryLabel } from "@/lib/format";

const FIELD =
  "mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10";

type WalkInResult = { studentCreated: boolean; status: "booked" | "occupied" };

/** A student who came in person, not through CampusHomes (Festo, 2026-10-23).
 * The API finds their student account by phone or creates one, books the bed
 * (taking it off CampusHomes at once) and texts them how to sign in. */
export function WalkInStudentButton({ beds }: { beds: WalkInBed[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="gap-1.5">
        <UserPlus aria-hidden className="size-4" />
        Add walk-in student
      </Button>
      {open && <WalkInStudentDialog beds={beds} onClose={() => setOpen(false)} />}
    </>
  );
}

function WalkInStudentDialog({ beds, onClose }: { beds: WalkInBed[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [university, setUniversity] = useState<University>("MUK");
  const [bedId, setBedId] = useState(beds[0]?.id ?? "");
  const [movedIn, setMovedIn] = useState(false);
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<WalkInResult | null>(null);

  // Total is the booked room's rent; Balance follows what was paid.
  const totalUgx = beds.find((bed) => bed.id === bedId)?.pricePerTermUgx ?? 0;
  const paidUgx = Number(amountPaid) || 0;
  const balanceUgx = totalUgx - paidUgx;
  const overpaid = balanceUgx < 0;

  const byProperty = new Map<string, WalkInBed[]>();
  for (const bed of beds) byProperty.set(bed.propertyName, [...(byProperty.get(bed.propertyName) ?? []), bed]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api<WalkInResult>("/reservations/walk-in", {
        method: "POST",
        body: JSON.stringify({
          bedId,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          university,
          movedIn,
          bookingFeeCollectedUgx: paidUgx > 0 ? paidUgx : undefined,
          paymentMethod: paymentMethod || undefined,
        }),
      });
      setDone(result);
      router.refresh();
    } catch (caught) {
      setError(apiErrorMessage(caught, "Couldn't add this student. Check the details and try again."));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <Dialog aria-label="Walk-in student added" open onOpenChange={(next) => { if (!next) onClose(); }} size="sm">
        <DialogHeader title="Student added" onClose={onClose} />
        <DialogBody>
          <p role="status" className="text-sm">
            {name.trim()} now has this room {done.status === "occupied" ? "and is recorded as moved in" : "booked"}. The bed is no longer offered on CampusHomes.
            {done.studentCreated ? " We created their CampusHomes account." : " They already had a CampusHomes account."}{" "}
            {email.trim() ? `We emailed ${email.trim()} how to sign in and see the booking${paidUgx > 0 ? ", with a payment receipt" : ""}.` : `They sign in with ${phone.trim()} to see the booking.`}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>Done</Button>
        </DialogFooter>
      </Dialog>
    );
  }

  return (
    <Dialog aria-label="Add a walk-in student" open onOpenChange={(next) => { if (!next) onClose(); }} size="lg" dismissible={false}>
      <form onSubmit={submit} className="contents">
        <DialogHeader
          title="Add a walk-in student"
          description="For a student who came to you in person. We create their CampusHomes account (or use the one with this phone), book the bed, and text them how to sign in."
          onClose={onClose}
        />
        <DialogBody className="space-y-6">
          {beds.length === 0 ? (
            <p role="alert" className="text-sm text-destructive">
              No free beds right now. Free a bed in Manage rooms first, or check that your hostel is published.
            </p>
          ) : (
            <>
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-2 font-display text-base font-semibold">Student</legend>
                <label className="block text-sm font-semibold">
                  Full name <span aria-hidden className="text-destructive">*</span>
                  <input required minLength={2} maxLength={120} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
                </label>
                <label className="block text-sm font-semibold">
                  Phone number <span aria-hidden className="text-destructive">*</span>
                  <input required type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256 7XX XXX XXX" aria-describedby="walk-in-phone-hint" className={FIELD} />
                  <span id="walk-in-phone-hint" className="mt-1 block text-xs font-normal text-muted-foreground">They sign in with this number.</span>
                </label>
                <label className="block text-sm font-semibold">
                  Email (optional)
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="walk-in-email-hint" className={FIELD} />
                  <span id="walk-in-email-hint" className="mt-1 block text-xs font-normal text-muted-foreground">They can sign in with it, and payment receipts go here.</span>
                </label>
                <label className="block text-sm font-semibold">
                  University <span aria-hidden className="text-destructive">*</span>
                  <select required value={university} onChange={(e) => setUniversity(e.target.value as University)} className={FIELD}>
                    {UNIVERSITIES.map((id) => <option key={id} value={id}>{UNIVERSITY_LABELS[id]}</option>)}
                  </select>
                </label>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="mb-2 font-display text-base font-semibold">Room</legend>
                <label className="block text-sm font-semibold">
                  Bed <span aria-hidden className="text-destructive">*</span>
                  <select required value={bedId} onChange={(e) => setBedId(e.target.value)} className={FIELD}>
                    {[...byProperty].map(([propertyName, propertyBeds]) => (
                      <optgroup key={propertyName} label={propertyName}>
                        {propertyBeds.map((bed) => (
                          <option key={bed.id} value={bed.id}>
                            {bed.roomLabel} · {bed.bedLabel} ({roomCategoryLabel(bed.roomCategory)}{bed.selfContained ? ", self-contained" : ""})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <div role="radiogroup" aria-label="Move-in" className="grid gap-2 sm:grid-cols-2">
                  {[
                    { value: false, title: "Booked, moving in later", body: "They confirm the move-in from their account." },
                    { value: true, title: "Moved in today", body: "Record the move-in now." },
                  ].map((option) => (
                    <label key={String(option.value)} className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <input type="radio" name="walk-in-moved-in" checked={movedIn === option.value} onChange={() => setMovedIn(option.value)} className="mt-1" />
                      <span><span className="block text-sm font-semibold">{option.title}</span><span className="block text-xs text-muted-foreground">{option.body}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-3">
                <legend className="mb-2 font-display text-base font-semibold">Payment received (optional)</legend>
                <label className="block text-sm font-semibold">
                  Booking fee / Amount paid (UGX)
                  <input
                    type="number"
                    min={0}
                    max={totalUgx || undefined}
                    inputMode="numeric"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    aria-invalid={overpaid || undefined}
                    aria-describedby={overpaid ? "walk-in-overpaid" : undefined}
                    className={FIELD}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Total
                  <input readOnly tabIndex={-1} value={formatUgx(totalUgx)} aria-describedby="walk-in-total-hint" className={`${FIELD} bg-muted/40`} />
                  <span id="walk-in-total-hint" className="mt-1 block text-xs font-normal text-muted-foreground">This room&apos;s rent per semester.</span>
                </label>
                <label className="block text-sm font-semibold">
                  Balance
                  <output
                    aria-live="polite"
                    className={`${FIELD} flex items-center bg-muted/40 font-semibold ${balanceUgx > 0 || overpaid ? "text-destructive" : "text-foreground"}`}
                  >
                    {formatUgx(Math.max(balanceUgx, 0))}
                  </output>
                </label>
                {overpaid && (
                  <p id="walk-in-overpaid" role="alert" className="text-sm text-destructive sm:col-span-3">
                    Amount paid is more than the total. Enter at most {formatUgx(totalUgx)}.
                  </p>
                )}
                <label className="block text-sm font-semibold">
                  Paid with
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={FIELD}>
                    <option value="">Not recorded</option>
                    {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </fieldset>
            </>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending || beds.length === 0 || overpaid}>{pending ? "Adding…" : "Add student and book bed"}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
