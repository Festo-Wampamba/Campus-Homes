"use client";

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BedDouble, Camera, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  type Property,
  type PropertyDetail,
  type TenantAgreementForPropertyRow,
  type UnitOperationalStatus,
} from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { PropertyQrCode } from "@/components/property-qr-code";
import { StatusChip } from "@/components/status-chip";
import { TenantAgreementBuilderDialog } from "@/components/tenant-agreement-builder-dialog";
import { api, ApiError } from "@/lib/api";
import { listingPhotoUrl, uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";
import { formatUgx } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROOM_CATEGORY_LABEL: Record<string, string> = {
  single: "Single",
  double: "Double",
  triple: "Triple",
  quad: "Quad",
  other: "Other",
};

// ponytail: 3-entry map duplicated from properties-manager.tsx rather than
// exported from it — that file imports this dialog, so sharing the const
// would create a circular import.
const PROPERTY_STATUS_LABEL: Record<string, string> = {
  pending_kyc: "Awaiting verification",
  active: "Active",
  suspended: "Suspended",
};

// 'vacant'/'held'/'occupied' predate bed-level inventory (0033) — actual
// occupancy is now tracked per-bed via the reservation state machine (the
// Status column), not here. Only the 3 values below are still selectable;
// the others render read-only if a room somehow still carries one, so the
// dropdown doesn't silently show something misleading next to real bed
// status ("Bed 1: Occupied" beside an unrelated "Available" dropdown was
// exactly the confusing pairing this narrows down).
const SELECTABLE_OPERATIONAL_STATUSES: UnitOperationalStatus[] = [
  'available',
  'under_maintenance',
  'blocked',
];

const OPERATIONAL_STATUS_LABEL: Record<UnitOperationalStatus, string> = {
  available: "Available",
  vacant: "Vacant (legacy)",
  held: "Held (legacy)",
  occupied: "Occupied (legacy)",
  under_maintenance: "Maintenance",
  blocked: "Blocked",
};

function RoomStats({
  total,
  available,
  occupied,
  pending,
}: {
  total: number;
  available: number;
  occupied: number;
  pending: number;
}) {
  const items = [
    { label: "Total", value: total, className: "text-foreground" },
    { label: "Available", value: available, className: "text-success" },
    { label: "Occupied", value: occupied, className: "text-foreground" },
    { label: "Pending", value: pending, className: "text-warning" },
  ];
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-1.5">
          <span className={cn("text-lg font-bold tabular-nums", item.className)}>{item.value}</span>
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

function CoverPhoto({ property }: { property: Property }) {
  const url = property.coverPhotoKey ? listingPhotoUrl(property.coverPhotoKey, 800) : null;
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL
    <img src={url} alt="" className="h-48 w-full rounded-md object-cover" />
  );
}

/** Read-only — self-serve submissions, nothing for the landlord to approve
 * here (see tenant-agreements.service.ts). Fetches on mount, same pattern
 * as PropertyDetailBody. Each row expands to show every answer plus the
 * signature (drawn image, or the typed name is already the header). */
function TenantAgreementsList({ propertyId }: { propertyId: string }) {
  const [agreements, setAgreements] = useState<TenantAgreementForPropertyRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<TenantAgreementForPropertyRow[]>(`/tenant-agreements/property/${propertyId}`)
      .then((rows) => {
        if (!cancelled) setAgreements(rows);
      })
      .catch(() => {
        if (!cancelled) setAgreements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  if (!agreements || agreements.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
        Tenant agreements ({agreements.length})
      </p>
      <div className="divide-y divide-border rounded-md border border-border">
        {agreements.map((a) => {
          const expanded = expandedId === a.id;
          const signatureUrl =
            a.signature_type === "drawn" && a.signature_storage_key
              ? listingPhotoUrl(a.signature_storage_key, 300)
              : null;
          return (
            <div key={a.id}>
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : a.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">
                    {a.signed_name ?? a.student_name ?? "Unnamed student"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Signed{" "}
                    {new Date(a.submitted_at).toLocaleDateString([], {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                    {a.signature_type === "drawn" ? " · drawn signature" : ""}
                  </p>
                </div>
                {expanded ? (
                  <ChevronUp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              {expanded && (
                <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3">
                  {a.responses.map((r) => (
                    <div key={r.fieldId}>
                      <p className="text-xs font-semibold text-muted-foreground">{r.label}</p>
                      <p className="text-sm text-foreground">
                        {Array.isArray(r.value) ? r.value.join(", ") : r.value}
                      </p>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    {a.declaration_accepted ? "Declaration accepted" : "Declaration not recorded"}
                  </p>
                  {signatureUrl && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">Signature</p>
                      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL */}
                      <img
                        src={signatureUrl}
                        alt="Drawn signature"
                        className="mt-1 h-16 rounded-md border border-border bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isBedAvailable(bed: PropertyDetail["rooms"][number]["beds"][number]): boolean {
  return !bed.blocked && bed.status === null;
}

// A hostel can have 100+ rooms — burying the few still-free beds under a
// long run of fully-booked rooms (sorted however Ops originally entered
// them) makes the landlord scroll past everything occupied first. Rooms
// with more available beds sort to the top; a fully-let room sinks toward
// the bottom. Ties keep their original relative order.
function sortRoomsByAvailability(rooms: PropertyDetail["rooms"]): PropertyDetail["rooms"] {
  return [...rooms]
    .map((room, index) => ({ room, index, available: room.beds.filter(isBedAvailable).length }))
    .sort((a, b) => b.available - a.available || a.index - b.index)
    .map(({ room }) => room);
}

// One chip per bed (0033) — a room's beds can each be in a different state,
// so there's no single "the room's status" anymore.
function bedStatusChip(bed: PropertyDetail["rooms"][number]["beds"][number]) {
  if (bed.blocked) {
    return (
      <StatusChip key={bed.id} tone="neutral">
        {bed.label}: Blocked
      </StatusChip>
    );
  }
  switch (bed.status) {
    case "reserved":
      return (
        <StatusChip key={bed.id} tone="warning">
          {bed.label}: Reserved
        </StatusChip>
      );
    case "booked":
      return (
        <StatusChip key={bed.id} tone="warning">
          {bed.label}: Booked
        </StatusChip>
      );
    case "occupied":
      return (
        <StatusChip key={bed.id} tone="neutral">
          {bed.label}: Occupied
        </StatusChip>
      );
    default:
      return (
        <StatusChip key={bed.id} tone="success">
          {bed.label}: Available
        </StatusChip>
      );
  }
}

/** Lets the landlord flip a room's status by hand — the fix for the
 * off-platform-tenant gap: `reservationStatus` above only ever reflects a
 * reservation made through CampusHomes, so a room let directly (no
 * reservations row at all) had no way to stop showing as available to
 * students. Independent of the reservation column: a room can be
 * `operationalStatus: "occupied"` with no reservation, or vice versa. */
function RoomOccupancyControl({
  room,
  onChange,
}: {
  room: PropertyDetail["rooms"][number];
  onChange: (operationalStatus: UnitOperationalStatus) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(value: UnitOperationalStatus) {
    setError(null);
    setSaving(true);
    try {
      await api(`/listings/units/${room.id}/operational-status`, {
        method: "PATCH",
        body: JSON.stringify({ operationalStatus: value }),
      });
      onChange(value);
    } catch (err) {
      setError(errorMessage(err, "Couldn't update this room's status — try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={room.operationalStatus}
        disabled={saving}
        onChange={(e) => void handleChange(e.target.value as UnitOperationalStatus)}
        className="h-8 rounded-md border border-input bg-background px-1.5 text-xs text-foreground disabled:opacity-60"
      >
        {!SELECTABLE_OPERATIONAL_STATUSES.includes(room.operationalStatus) && (
          <option value={room.operationalStatus} disabled>
            {OPERATIONAL_STATUS_LABEL[room.operationalStatus]}
          </option>
        )}
        {SELECTABLE_OPERATIONAL_STATUSES.map((status) => (
          <option key={status} value={status}>
            {OPERATIONAL_STATUS_LABEL[status]}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  mtn_momo: "MTN MoMo",
  airtel_money: "Airtel Money",
  card: "Card",
  bank_transfer: "Bank transfer",
};

/** Book an Available bed directly with no prior Reserve — the walk-in path
 * (§7 of the redesign doc): a landlord covering a tenant who showed up
 * in person rather than through the app. */
function WalkInBookDialog({
  bedId,
  bedLabel,
  open,
  onOpenChange,
  onBooked,
}: {
  bedId: string;
  bedLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBooked: () => void;
}) {
  const [studentPhone, setStudentPhone] = useState("");
  const [bookingFeeCollectedUgx, setBookingFeeCollectedUgx] = useState("");
  const [depositCollectedUgx, setDepositCollectedUgx] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentPhone.trim()) return;
    setPending(true);
    setError(null);
    try {
      await api("/reservations/book", {
        method: "POST",
        body: JSON.stringify({
          bedId,
          studentPhone: studentPhone.trim(),
          bookingFeeCollectedUgx: bookingFeeCollectedUgx ? Number(bookingFeeCollectedUgx) : undefined,
          depositCollectedUgx: depositCollectedUgx ? Number(depositCollectedUgx) : undefined,
          paymentMethod: paymentMethod || undefined,
        }),
      });
      onOpenChange(false);
      setStudentPhone("");
      setBookingFeeCollectedUgx("");
      setDepositCollectedUgx("");
      setPaymentMethod("");
      onBooked();
    } catch (err) {
      setError(errorMessage(err, "Couldn't book this bed — try again."));
    } finally {
      setPending(false);
    }
  }

  // Portaled to <body> — this dialog is invoked from inside the outer
  // property dialog's own native <dialog>, and two nested <dialog>
  // elements calling showModal()/close() on each other causes the browser
  // to close the OUTER one too (a real bug caught live-testing this).
  // Portaling makes this a DOM sibling instead of a descendant; it still
  // promotes to the top layer via its own showModal() call, so it stacks
  // above the outer dialog correctly.
  return createPortal(
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader
        title={`Book ${bedLabel}`}
        description="For a tenant who showed up in person — no prior Reserve needed. The student must already have a CampusHomes account with their university set."
        onClose={() => onOpenChange(false)}
      />
      <DialogBody>
        <form id={`walkin-book-form-${bedId}`} onSubmit={submit} className="space-y-3">
          <label className="block text-sm font-semibold text-foreground">
            Student&apos;s phone number
            <input
              required
              autoFocus
              type="tel"
              value={studentPhone}
              onChange={(e) => setStudentPhone(e.target.value)}
              placeholder="+2567…"
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
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
          form={`walkin-book-form-${bedId}`}
          disabled={pending || !studentPhone.trim()}
          // This dialog is nested inside the outer property dialog's native
          // <dialog> — without stopping propagation, submitting closes this
          // dialog AND bubbles a click into the outer one, closing that too.
          onClick={(e) => e.stopPropagation()}
        >
          {pending ? "Booking…" : "Book bed"}
        </Button>
      </DialogFooter>
    </Dialog>,
    document.body,
  );
}

/** Confirms a Reserved bed into Booked (§7's other path — a student already
 * holds the bed through `reserve()`, so unlike WalkInBookDialog there's no
 * student to identify, just what the landlord collected in person). */
function ConfirmBookingDialog({
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
      setError(errorMessage(err, "Couldn't confirm this booking — try again."));
    } finally {
      setPending(false);
    }
  }

  // Portaled for the same reason as WalkInBookDialog above — nested <dialog>
  // elements would otherwise close the outer property dialog too.
  return createPortal(
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader
        title={`Book ${bedLabel}`}
        description="Confirm this reservation into a booking — record whatever you collected from the student in person or by mobile money."
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

/** Frees a Reserved or Booked bed back up — always with a reason (§15-16). */
function ReleaseBedDialog({
  reservationId,
  bedLabel,
  open,
  onOpenChange,
  onReleased,
}: {
  reservationId: string;
  bedLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReleased: () => void;
}) {
  const [reason, setReason] = useState("");
  const [refundRequired, setRefundRequired] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setPending(true);
    setError(null);
    try {
      await api(`/reservations/${reservationId}/release`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim(), refundRequired }),
      });
      onOpenChange(false);
      setReason("");
      setRefundRequired(false);
      onReleased();
    } catch (err) {
      setError(errorMessage(err, "Couldn't release this bed — try again."));
    } finally {
      setPending(false);
    }
  }

  // Portaled — same nested-<dialog> reasoning as WalkInBookDialog above.
  return createPortal(
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader
        title={`Release ${bedLabel}`}
        description="Frees the bed for someone else to reserve. Always recorded with a reason."
        onClose={() => onOpenChange(false)}
      />
      <DialogBody>
        <form id={`release-form-${reservationId}`} onSubmit={submit} className="space-y-3">
          <label className="block text-sm font-semibold text-foreground">
            Reason
            <textarea
              required
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={refundRequired}
              onChange={(e) => setRefundRequired(e.target.checked)}
            />
            A refund is owed for money already collected
          </label>
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
        </form>
      </DialogBody>
      <DialogFooter>
        <Button
          type="submit"
          form={`release-form-${reservationId}`}
          disabled={pending || !reason.trim()}
          // Same nested-<dialog> propagation fix as WalkInBookDialog's submit.
          onClick={(e) => e.stopPropagation()}
        >
          {pending ? "Releasing…" : "Release bed"}
        </Button>
      </DialogFooter>
    </Dialog>,
    document.body,
  );
}

function ConfirmMoveInButton({ reservationId, onConfirmed }: { reservationId: string; onConfirmed: () => void }) {
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await api(`/reservations/${reservationId}/move-in`, { method: "POST" });
      onConfirmed();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" size="sm" disabled={pending} onClick={confirm}>
      {pending ? "Confirming…" : "Confirm move-in"}
    </Button>
  );
}

/** Per-bed action row (0033) — Available beds can be walk-in Booked;
 * Reserved/Booked beds can be Released (and Booked ones moved in); an
 * Occupied bed has no action here (future tenancy rules are out of scope,
 * §19). A manually blocked bed has none either — unblock via operational
 * status isn't wired here since blocking is bed-level, not room-level. */
function BedActions({
  bed,
  onChanged,
}: {
  bed: PropertyDetail["rooms"][number]["beds"][number];
  onChanged: () => void;
}) {
  const [showBook, setShowBook] = useState(false);
  const [showRelease, setShowRelease] = useState(false);

  if (bed.blocked || bed.status === "occupied") return null;

  if (bed.status === null) {
    return (
      <>
        <Button type="button" variant="secondary" size="sm" onClick={() => setShowBook(true)}>
          Book
        </Button>
        <WalkInBookDialog
          bedId={bed.id}
          bedLabel={bed.label}
          open={showBook}
          onOpenChange={setShowBook}
          onBooked={onChanged}
        />
      </>
    );
  }

  // reserved or booked — reservationId is always set once status is non-null.
  return (
    <div className="flex flex-wrap gap-1.5">
      {bed.status === "reserved" && bed.reservationId && (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowBook(true)}>
            Book
          </Button>
          <ConfirmBookingDialog
            reservationId={bed.reservationId}
            bedLabel={bed.label}
            open={showBook}
            onOpenChange={setShowBook}
            onBooked={onChanged}
          />
        </>
      )}
      {bed.status === "booked" && bed.reservationId && (
        <ConfirmMoveInButton reservationId={bed.reservationId} onConfirmed={onChanged} />
      )}
      <Button type="button" variant="secondary" size="sm" onClick={() => setShowRelease(true)}>
        Release
      </Button>
      {bed.reservationId && (
        <ReleaseBedDialog
          reservationId={bed.reservationId}
          bedLabel={bed.label}
          open={showRelease}
          onOpenChange={setShowRelease}
          onReleased={onChanged}
        />
      )}
    </div>
  );
}

/** Whole-property gallery — distinct from RoomPhotoManager (per-room) below
 * and from the Ops-captured "Verification photos" (read-only, EXIF-verified
 * at inspection time). This is the landlord's own write surface for
 * whole-property shots (property_media, 0026), shown publicly alongside the
 * inspection gallery on the listing detail page. */
function PropertyMediaManager({
  propertyId,
  media,
  onMediaChange,
}: {
  propertyId: string;
  media: PropertyDetail["propertyMedia"];
  onMediaChange: (media: PropertyDetail["propertyMedia"]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
      const { publicId } = await uploadToCloudinary(file, sig);
      const created = await api<{ id: string; storageKey: string }>(
        `/listings/properties/${propertyId}/media`,
        { method: "POST", body: JSON.stringify({ storageKey: publicId }) },
      );
      onMediaChange([...media, { id: created.id, storageKey: created.storageKey }]);
    } catch (err) {
      setError(errorMessage(err, "Couldn't upload this photo — try again."));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(mediaId: string) {
    setError(null);
    setRemovingId(mediaId);
    try {
      await api(`/listings/properties/media/${mediaId}`, { method: "DELETE" });
      onMediaChange(media.filter((m) => m.id !== mediaId));
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove this photo — try again."));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
        Property photos ({media.length})
      </p>
      <p className="mb-2 text-xs text-muted-foreground">
        Shown publicly on this property&apos;s listing page — separate from each room&apos;s own photos.
      </p>
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      {media.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.map((item) => {
            const url = listingPhotoUrl(item.storageKey, 300);
            return (
              <div key={item.id} className="group relative">
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL
                  <img src={url} alt="" className="aspect-square w-full rounded-md object-cover" />
                )}
                <button
                  type="button"
                  aria-label="Remove photo"
                  disabled={removingId === item.id}
                  onClick={() => handleRemove(item.id)}
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-teal-700">
        <Camera aria-hidden className="size-4" />
        {uploading ? "Uploading…" : "Add a property photo"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleUpload(file);
          }}
        />
      </label>
    </div>
  );
}

/** Inline expanded panel under a room row — upload a photo for this specific
 * room and remove existing ones. Photos here are separate from the
 * Ops-captured whole-listing gallery above (unit_photos, landlord-writable —
 * the one part of a room a landlord can manage directly, since units
 * themselves stay Ops-only to create/edit). */
function RoomPhotoManager({
  room,
  onPhotosChange,
}: {
  room: PropertyDetail["rooms"][number];
  onPhotosChange: (photos: PropertyDetail["rooms"][number]["photos"]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
      const { publicId } = await uploadToCloudinary(file, sig);
      const created = await api<{ id: string; storageKey: string }>(
        `/listings/units/${room.id}/photos`,
        { method: "POST", body: JSON.stringify({ storageKey: publicId }) },
      );
      onPhotosChange([...room.photos, { id: created.id, storageKey: created.storageKey }]);
    } catch (err) {
      setError(errorMessage(err, "Couldn't upload this photo — try again."));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(photoId: string) {
    setError(null);
    setRemovingId(photoId);
    try {
      await api(`/listings/units/photos/${photoId}`, { method: "DELETE" });
      onPhotosChange(room.photos.filter((p) => p.id !== photoId));
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove this photo — try again."));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {room.photos.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {room.photos.map((photo) => {
            const url = listingPhotoUrl(photo.storageKey, 150);
            return (
              <div key={photo.id} className="group relative">
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL
                  <img src={url} alt="" className="aspect-square w-full rounded-md object-cover" />
                )}
                <button
                  type="button"
                  aria-label="Remove photo"
                  disabled={removingId === photo.id}
                  onClick={() => handleRemove(photo.id)}
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-teal-700">
        <Camera aria-hidden className="size-4" />
        {uploading ? "Uploading…" : "Add a photo of this room"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleUpload(file);
          }}
        />
      </label>
    </div>
  );
}

/** Fetches on mount — mounted only while the dialog is open (same pattern as
 * PropertyForm), so every open re-fetches fresh rather than showing stale
 * data from a previous property. */
function PropertyDetailBody({ propertyId }: { propertyId: string }) {
  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [semesters, setSemesters] = useState<{ id: string; name: string }[]>([]);
  const [semesterId, setSemesterId] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<PropertyDetail>(`/listings/properties/${propertyId}/detail`)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this property's rooms — try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  // Only needed once we know the property has no listing yet — no point
  // fetching semesters for a property that already has one.
  useEffect(() => {
    if (!detail || detail.listing) return;
    let cancelled = false;
    api<{ id: string; name: string }[]>(`/listings/semesters?catchment=${detail.property.catchment}`)
      .then((rows) => {
        if (cancelled) return;
        setSemesters(rows ?? []);
        setSemesterId((rows ?? [])[0]?.id ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [detail]);

  // Book/Release/Confirm-move-in all change bed state server-side in ways
  // that ripple beyond a single field (status, reservationId, bookedAt,
  // fee/deposit) — a full refetch is simpler and safer than reconciling
  // partial state client-side.
  async function refreshDetail() {
    try {
      const refreshed = await api<PropertyDetail>(`/listings/properties/${propertyId}/detail`);
      setDetail(refreshed);
    } catch {
      // Transient — the bed grid just keeps showing its pre-action state.
    }
  }

  async function requestListing() {
    if (!semesterId) return;
    setRequesting(true);
    setRequestError(null);
    try {
      await api(`/listings/drafts`, {
        method: "POST",
        body: JSON.stringify({ propertyId, semesterId }),
      });
      const refreshed = await api<PropertyDetail>(`/listings/properties/${propertyId}/detail`);
      setDetail(refreshed);
    } catch (err) {
      setRequestError(errorMessage(err, "Couldn't request a listing — try again."));
    } finally {
      setRequesting(false);
    }
  }

  function setRoomPhotos(roomId: string, photos: PropertyDetail["rooms"][number]["photos"]) {
    setDetail((prev) =>
      prev
        ? { ...prev, rooms: prev.rooms.map((r) => (r.id === roomId ? { ...r, photos } : r)) }
        : prev,
    );
  }

  function setRoomOperationalStatus(roomId: string, operationalStatus: UnitOperationalStatus) {
    setDetail((prev) =>
      prev
        ? { ...prev, rooms: prev.rooms.map((r) => (r.id === roomId ? { ...r, operationalStatus } : r)) }
        : prev,
    );
  }

  function setPropertyMedia(propertyMedia: PropertyDetail["propertyMedia"]) {
    setDetail((prev) => (prev ? { ...prev, propertyMedia } : prev));
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!detail) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const rooms = detail.rooms;
  const beds = rooms.flatMap((r) =>
    r.beds.map((b) => ({ ...b, roomOperationalStatus: r.operationalStatus })),
  );
  const stats = {
    total: beds.length,
    available: beds.filter(
      (b) =>
        !b.blocked &&
        b.status === null &&
        (b.roomOperationalStatus === "available" || b.roomOperationalStatus === "vacant"),
    ).length,
    occupied: beds.filter((b) => b.status === "occupied" || b.roomOperationalStatus === "occupied")
      .length,
    pending: beds.filter((b) => b.status === "reserved" || b.status === "booked").length,
  };

  return (
    <div className="space-y-6">
      <RoomStats {...stats} />

      <PropertyMediaManager propertyId={propertyId} media={detail.propertyMedia} onMediaChange={setPropertyMedia} />

      {detail.listing && detail.listing.status !== "verified" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {detail.listing.status === "draft"
            ? "This listing is a draft — it won't appear in student search until Ops schedules and completes a verification visit and publishes it."
            : `Listing status: ${detail.listing.status.replaceAll("_", " ")} — not yet visible in student search.`}
        </div>
      )}
      {!detail.listing ? (
        <div className="space-y-3">
          <EmptyState
            icon={BedDouble}
            title="No listing yet"
            body="Request a listing for a semester so Ops can schedule your verification visit and publish it."
          />
          {semesters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={semesterId}
                onChange={(e) => setSemesterId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Button type="button" onClick={requestListing} disabled={requesting}>
                {requesting ? "Requesting…" : "Request listing"}
              </Button>
            </div>
          )}
          {requestError && <p className="text-sm text-destructive">{requestError}</p>}
        </div>
      ) : (
        <>
          {detail.photos.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                Verification photos
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {detail.photos.map((storageKey) => {
                  const url = listingPhotoUrl(storageKey, 300);
                  return url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL, same pattern as public listing detail
                    <img
                      key={storageKey}
                      src={url}
                      alt=""
                      className="aspect-square w-full rounded-md object-cover"
                    />
                  ) : null;
                })}
              </div>
            </div>
          )}

          {detail.rooms.length === 0 ? (
            <EmptyState
              icon={BedDouble}
              title="No rooms yet"
              body="Ops adds rooms once this listing is published."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">Room</th>
                <th scope="col" className="px-3 py-2">Type</th>
                <th scope="col" className="px-3 py-2">Sleeps</th>
                <th scope="col" className="px-3 py-2">Price / bed / semester</th>
                <th scope="col" className="px-3 py-2">Deposit</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2">Room override</th>
                <th scope="col" className="px-3 py-2">Photos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortRoomsByAvailability(detail.rooms).map((room) => {
                const expanded = expandedRoomId === room.id;
                return (
                  <Fragment key={room.id}>
                    <tr>
                      <td className="px-3 py-2 font-semibold text-foreground">{room.label}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {ROOM_CATEGORY_LABEL[room.roomCategory] ?? room.roomCategory}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{room.capacity}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatUgx(room.pricePerTermUgx)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {room.depositUgx != null ? formatUgx(room.depositUgx) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {/* Compact by default — a quad's 4 beds shouldn't force
                            4 rows of buttons into view for every room in a
                            100-room hostel. Expand for the actual Book/
                            Release/Confirm controls. */}
                        <div className="flex flex-wrap gap-1">{room.beds.map(bedStatusChip)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <RoomOccupancyControl
                          room={room}
                          onChange={(operationalStatus) => setRoomOperationalStatus(room.id, operationalStatus)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedRoomId(expanded ? null : room.id)}
                        >
                          <Camera aria-hidden className="size-4" />
                          {room.photos.length}
                          {expanded ? (
                            <ChevronUp aria-hidden className="size-3.5" />
                          ) : (
                            <ChevronDown aria-hidden className="size-3.5" />
                          )}
                        </Button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={8} className="space-y-4 bg-muted/10 px-3 py-3">
                          <div>
                            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
                              Beds
                            </p>
                            <div className="space-y-1.5">
                              {room.beds.map((bed) => (
                                <div key={bed.id} className="flex flex-wrap items-center gap-1.5">
                                  {bedStatusChip(bed)}
                                  <BedActions bed={bed} onChanged={refreshDetail} />
                                </div>
                              ))}
                            </div>
                          </div>
                          <RoomPhotoManager
                            room={room}
                            onPhotosChange={(photos) => setRoomPhotos(room.id, photos)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}
    </div>
  );
}

export function PropertyDetailDialog({
  open,
  onOpenChange,
  property,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property | null;
}) {
  const [builderOpen, setBuilderOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg">
      {property && (
        <>
          <DialogHeader
            title={property.name}
            description={`${property.streetAddress} · ${PROPERTY_STATUS_LABEL[property.status] ?? property.status}`}
            onClose={() => onOpenChange(false)}
          />
          <DialogBody className="space-y-6">
            <CoverPhoto property={property} />
            <div className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Tenant agreement form</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Design the form students fill out and sign after scanning this property&apos;s QR code.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => setBuilderOpen(true)}>
                Edit form
              </Button>
            </div>
            <PropertyQrCode propertyId={property.id} propertyName={property.name} />
            <TenantAgreementsList propertyId={property.id} />
            <PropertyDetailBody propertyId={property.id} />
          </DialogBody>
          <TenantAgreementBuilderDialog
            open={builderOpen}
            onOpenChange={setBuilderOpen}
            propertyId={property.id}
            propertyName={property.name}
          />
        </>
      )}
    </Dialog>
  );
}
