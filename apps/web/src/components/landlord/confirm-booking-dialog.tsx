"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { api, apiErrorMessage } from "@/lib/api";

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  mtn_momo: "MTN MoMo",
  airtel_money: "Airtel Money",
  card: "Card",
  bank_transfer: "Bank transfer",
};

/** Confirms a Reserved bed into Booked (§7's other path — a student already
 * holds the bed through `reserve()`, so unlike WalkInBookDialog there's no
 * student to identify, just what the landlord collected in person). */
export function ConfirmBookingDialog({
  reservationId,
  bedLabel,
  open,
  onOpenChange,
  onBooked,
}: {
  reservationId: string;
  bedLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBooked: () => void;
}) {
  const [bookingFeeCollectedUgx, setBookingFeeCollectedUgx] = useState("");
  const [depositCollectedUgx, setDepositCollectedUgx] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/reservations/book", {
        method: "POST",
        body: JSON.stringify({
          reservationId,
          bookingFeeCollectedUgx: bookingFeeCollectedUgx ? Number(bookingFeeCollectedUgx) : undefined,
          depositCollectedUgx: depositCollectedUgx ? Number(depositCollectedUgx) : undefined,
          paymentMethod: paymentMethod || undefined,
        }),
      });
      onOpenChange(false);
      setBookingFeeCollectedUgx("");
      setDepositCollectedUgx("");
      setPaymentMethod("");
      onBooked();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't confirm this booking. Try again."));
    } finally {
      setPending(false);
    }
  }

  // Portaled to <body>: opened from inside the property dialog's own native
  // <dialog>, nested <dialog> elements would otherwise close the outer one too.
  return createPortal(
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader
        title={`Book ${bedLabel}`}
        description="Confirm this reservation into a booking. Record whatever you collected from the student in person or by mobile money."
        onClose={() => onOpenChange(false)}
      />
      <DialogBody>
        <form id={`confirm-book-form-${reservationId}`} onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-foreground">
              Booking fee collected (UGX)
              <input
                type="number"
                min={0}
                value={bookingFeeCollectedUgx}
                onChange={(e) => setBookingFeeCollectedUgx(e.target.value)}
                placeholder="Optional"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            <label className="block text-sm font-semibold text-foreground">
              Deposit collected (UGX)
              <input
                type="number"
                min={0}
                value={depositCollectedUgx}
                onChange={(e) => setDepositCollectedUgx(e.target.value)}
                placeholder="Optional"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
          </div>
          <label className="block text-sm font-semibold text-foreground">
            Payment method
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <option value="">Not recorded</option>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
        </form>
      </DialogBody>
      <DialogFooter>
        <Button
          type="submit"
          form={`confirm-book-form-${reservationId}`}
          disabled={pending}
          onClick={(e) => e.stopPropagation()}
        >
          {pending ? "Booking…" : "Book bed"}
        </Button>
      </DialogFooter>
    </Dialog>,
    document.body,
  );
}
