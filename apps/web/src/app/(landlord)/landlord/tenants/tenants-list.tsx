"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Phone } from "lucide-react";
import type { LandlordTenant } from "@campushomes/shared";

import { PAYMENT_METHOD_LABEL } from "@/components/landlord/confirm-booking-dialog";
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
    <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {status === "occupied" ? "Moved in" : "Booked"}
    </span>
  );
}

export function TenantsList({ tenants }: { tenants: LandlordTenant[] }) {
  const [openRoom, setOpenRoom] = useState<TenantRoom | null>(null);
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
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">Room</th>
                <th scope="col" className="px-3 py-2">Name</th>
                <th scope="col" className="px-3 py-2">Phone</th>
                <th scope="col" className="px-3 py-2">Email</th>
                <th scope="col" className="px-3 py-2">Emergency contact</th>
                <th scope="col" className="px-3 py-2 text-right">Total</th>
                <th scope="col" className="px-3 py-2 text-right">Paid</th>
                <th scope="col" className="px-3 py-2 text-right">Balance</th>
                <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.pageItems.map((t) => (
                <tr key={t.reservationId}>
                  <td className="px-3 py-2">
                    <span className="font-semibold text-foreground">{t.roomLabel}</span>
                    <span className="block text-xs text-muted-foreground">{t.propertyName} · {t.bedLabel}</span>
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {t.name ?? "Not given"}
                    <StatusChip status={t.status} />
                  </td>
                  <td className="px-3 py-2">{t.phone ? <a href={`tel:${t.phone}`} className="text-primary hover:underline">{t.phone}</a> : "Not given"}</td>
                  <td className="px-3 py-2">{t.email ? <a href={`mailto:${t.email}`} className="break-all text-primary hover:underline">{t.email}</a> : "Not given"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t.emergencyContactName || t.emergencyContactPhone
                      ? <>{t.emergencyContactName ?? ""}{t.emergencyContactPhone && <span className="block">{t.emergencyContactPhone}</span>}</>
                      : "Not given"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUgx(t.totalUgx)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUgx(t.paidUgx)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${t.balanceUgx > 0 ? "text-destructive" : "text-foreground"}`}>
                    {t.balanceUgx > 0 ? formatUgx(t.balanceUgx) : "Paid in full"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {t.balanceUgx > 0 && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => setPaying(t)}>
                        Record payment
                      </Button>
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
          description={`${tenant.name ?? "Student"} · ${tenant.roomLabel}. They get an emailed receipt.`}
          onClose={onClose}
        />
        <DialogBody className="space-y-4">
          <dl className="grid grid-cols-3 gap-2 text-sm">
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
