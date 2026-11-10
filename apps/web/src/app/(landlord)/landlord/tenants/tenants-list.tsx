"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Phone } from "lucide-react";
import type { LandlordTenant } from "@campushomes/shared";

import { PAYMENT_METHOD_LABEL } from "@/components/landlord/confirm-booking-dialog";
import { TenantEmergencyContactButton } from "@/components/landlord/tenant-emergency-contact";
import { TenantPortalStatus } from "@/components/landlord/tenant-portal-invite";
import { DownloadTenantsExcel } from "@/components/landlord/download-tenants-excel";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { api, apiErrorMessage } from "@/lib/api";
import { formatUgx } from "@/lib/format";
import { tenantsByRoom, type TenantRoom } from "@/lib/tenant-ledger";
import { usePagination } from "@/lib/use-pagination";

const FIELD =
  "mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10";

function StatusChip({ status }: { status: LandlordTenant["status"] }) {
  return (
    <span className="mt-1 inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {status === "occupied" ? "Moved in" : "Booked · Awaiting move-in"}
    </span>
  );
}

export function TenantsList({ tenants }: { tenants: LandlordTenant[] }) {
  const [openRoom, setOpenRoom] = useState<TenantRoom | null>(null);
  const [movingIn, setMovingIn] = useState<LandlordTenant | null>(null);
  const [paying, setPaying] = useState<LandlordTenant | null>(null);
  const rooms = usePagination(tenantsByRoom(tenants), 12);
  const rows = usePagination(tenants, 10);

  return (
    <div className="space-y-8">
      <section aria-labelledby="tenant-rooms-heading">
        <h2 id="tenant-rooms-heading" className="mb-3 text-lg">Rooms</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.pageItems.map((room) => (
            <button
              key={room.unitId}
              type="button"
              onClick={() => setOpenRoom(room)}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span>
                <span className="block font-semibold text-foreground">{room.roomLabel}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {room.propertyName} · {room.tenants.length} {room.tenants.length === 1 ? "student" : "students"}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
        <PaginationControls page={rooms.page} totalPages={rooms.totalPages} total={rooms.total} pageSize={rooms.pageSize} onPageChange={rooms.setPage} />
      </section>

      <section aria-labelledby="tenant-records-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="tenant-records-heading" className="text-lg">Tenant records</h2>
          <DownloadTenantsExcel />
        </div>
        <div role="region" aria-labelledby="tenant-records-heading" tabIndex={0} className="relative max-w-full overflow-x-auto rounded-md border border-border focus-visible:outline-2 focus-visible:outline-ring">
          {/* Sized to fit a 1280px laptop beside the sidebar: phone and email
              share a column, the rent total sits under the amount paid, and each
              action sits with the value it changes instead of in its own column. */}
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">Room</th>
                <th scope="col" className="px-3 py-2">Tenant</th>
                <th scope="col" className="px-3 py-2">Contact</th>
                <th scope="col" className="px-3 py-2">Emergency contact</th>
                <th scope="col" className="px-3 py-2 text-right">Paid</th>
                <th scope="col" className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.pageItems.map((t) => (
                <tr key={t.reservationId} className="align-top">
                  <td className="px-3 py-3">
                    <span className="font-semibold text-foreground">{t.roomLabel}</span>
                    <span className="block text-xs text-muted-foreground">{t.propertyName} · {t.bedLabel}</span>
                  </td>
                  <td className="px-3 py-3 text-foreground">
                    <span className="block min-w-36 font-medium">{t.name ?? "Not given"}</span>
                    <StatusChip status={t.status} />
                    <TenantPortalStatus tenant={t} />
                    {t.status === "booked" && <div><Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setMovingIn(t)}>Confirm move-in</Button></div>}
                  </td>
                  <td className="px-3 py-3">
                    {t.phone ? <a href={`tel:${t.phone}`} className="block whitespace-nowrap text-primary hover:underline">{t.phone}</a> : <span className="block text-muted-foreground">No phone</span>}
                    {t.email ? <a href={`mailto:${t.email}`} className="block min-w-44 text-xs break-all text-primary hover:underline">{t.email}</a> : <span className="block text-xs text-muted-foreground">No email</span>}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {t.emergencyContactName || t.emergencyContactPhone
                      ? <>{t.emergencyContactName ?? ""}{t.emergencyContactPhone && <span className="block whitespace-nowrap">{t.emergencyContactPhone}</span>}</>
                      : "Not given"}
                    <div><TenantEmergencyContactButton tenant={t} /></div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="tabular-nums">{formatUgx(t.paidUgx)}</span>
                    <span className="block text-xs whitespace-nowrap text-muted-foreground">of <span className="tabular-nums">{formatUgx(t.totalUgx)}</span></span>
                  </td>
                  <td className={`px-3 py-3 text-right font-semibold whitespace-nowrap ${t.balanceUgx > 0 ? "text-destructive" : "text-foreground"}`}>
                    <span className="tabular-nums">{t.balanceUgx > 0 ? formatUgx(t.balanceUgx) : "Paid in full"}</span>
                    {t.balanceUgx > 0 && (
                      <>
                        <span className="block text-xs font-normal text-muted-foreground">{t.paidUgx === 0 ? "Unpaid" : "Part-paid"}</span>
                        <Button type="button" variant="secondary" size="sm" className="mt-2 whitespace-nowrap" onClick={() => setPaying(t)}>Record payment</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls page={rows.page} totalPages={rows.totalPages} total={rows.total} pageSize={rows.pageSize} onPageChange={rows.setPage} />
      </section>

      {openRoom && (
        <Dialog aria-label={`Students in ${openRoom.roomLabel}`} open onOpenChange={(next) => { if (!next) setOpenRoom(null); }} size="sm">
          <DialogHeader title={openRoom.roomLabel} description={openRoom.propertyName} onClose={() => setOpenRoom(null)} />
          <DialogBody>
            <ul className="divide-y divide-border">
              {openRoom.tenants.map((t) => (
                <li key={t.reservationId} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="block font-semibold text-foreground">{t.name ?? "Name not given"}</span>
                    <span className="text-xs text-muted-foreground">{t.bedLabel}{t.status === "booked" ? " · Booked, not moved in yet" : ""}</span>
                  </span>
                  {t.phone && (
                    <a href={`tel:${t.phone}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                      <Phone aria-hidden className="size-4" />
                      {t.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </DialogBody>
        </Dialog>
      )}

      {movingIn && <ConfirmTenantMoveIn tenant={movingIn} onClose={() => setMovingIn(null)} />}
      {paying && <RecordPaymentDialog tenant={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function RecordPaymentDialog({ tenant, onClose }: { tenant: LandlordTenant; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  // One key per payment: a retry after a lost response can't record it twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [paymentMethod, setPaymentMethod] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountUgx = Number(amount) || 0;
  const tooMuch = amountUgx > tenant.balanceUgx;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(`/reservations/${tenant.reservationId}/payments`, {
        method: "POST",
        body: JSON.stringify({ amountUgx, paymentMethod: paymentMethod || undefined, idempotencyKey }),
      });
      router.refresh();
      onClose();
    } catch (caught) {
      setError(apiErrorMessage(caught, "Couldn't record this payment. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog aria-label="Record a payment" open onOpenChange={(next) => { if (!next) onClose(); }} size="sm" dismissible={false}>
      <form onSubmit={submit} className="flex min-h-0 flex-auto flex-col">
        <DialogHeader
          title="Record a payment"
          description={`${tenant.name ?? "Student"} · ${tenant.roomLabel}. A receipt is saved with this booking.`}
          onClose={onClose}
        />
        <DialogBody className="space-y-4">
          <dl className="ch-auto-grid [--ch-grid-min:9rem] gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Total</dt><dd className="font-semibold tabular-nums">{formatUgx(tenant.totalUgx)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Paid</dt><dd className="font-semibold tabular-nums">{formatUgx(tenant.paidUgx)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Balance</dt><dd className="font-semibold text-destructive tabular-nums">{formatUgx(tenant.balanceUgx)}</dd></div>
          </dl>
          <label className="block text-sm font-semibold">
            Amount paid (UGX) <span aria-hidden className="text-destructive">*</span>
            <input
              required
              type="number"
              min={1}
              max={tenant.balanceUgx}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={tooMuch || undefined}
              className={FIELD}
            />
          </label>
          {tooMuch && <p role="alert" className="text-sm text-destructive">That is more than the balance of {formatUgx(tenant.balanceUgx)}.</p>}
          <label className="block text-sm font-semibold">
            Paid with
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={FIELD}>
              <option value="">Not recorded</option>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {amountUgx > 0 && !tooMuch && (
            <p className="text-sm text-muted-foreground">
              Balance after this payment: <span className="font-semibold text-foreground">{formatUgx(tenant.balanceUgx - amountUgx)}</span>
            </p>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending || amountUgx <= 0 || tooMuch}>{pending ? "Saving…" : "Record payment"}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function ConfirmTenantMoveIn({ tenant, onClose }: { tenant: LandlordTenant; onClose: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setPending(true); setError(null);
    try {
      await api(`/reservations/${tenant.reservationId}/move-in`, { method: "POST" });
      router.refresh(); onClose();
    } catch (caught) { setError(apiErrorMessage(caught, "Could not confirm move-in. Try again.")); }
    finally { setPending(false); }
  }
  return <Dialog aria-label="Confirm tenant move-in" open size="sm" dismissible={false} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogHeader title="Confirm move-in" onClose={() => { if (!pending) onClose(); }} />
    <DialogBody className="space-y-3"><p>Confirm that {tenant.name ?? "this student"} is now living in {tenant.roomLabel}, {tenant.bedLabel} at {tenant.propertyName}.</p><p className="text-sm text-muted-foreground">Their status will change from booked to moved in. Their recorded payments and balance stay the same.</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</DialogBody>
    <DialogFooter><Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button disabled={pending} onClick={confirm}>{pending ? "Saving…" : "Confirm move-in"}</Button></DialogFooter>
  </Dialog>;
}
