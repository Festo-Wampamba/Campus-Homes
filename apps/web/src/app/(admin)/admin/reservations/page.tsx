import type { Metadata } from "next";

import { AdminTable } from "@/components/admin/admin-table";
import { Freshness, PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Reservations" };

export default async function ReservationsPage() {
  const data = await apiServer<{ rows: Record<string, unknown>[]; asOf: string; limit: number }>("/admin/reservations");
  return <><PageHeader eyebrow="Reservation operations" title="Reservations" description="Track the Reserve, Book, Move-in, Release, and cancellation lifecycle across every bed." />
    <SectionCard title={`${data?.rows.length ?? 0} reservations`} description="Newest first"><AdminTable rows={data?.rows ?? []} filename="campushomes-reservations.csv" searchPlaceholder="Search student, property, unit, bed, status…" columns={[
      { key: "id", label: "Reference", format: "id" }, { key: "student", label: "Student" }, { key: "property", label: "Property" }, { key: "unit", label: "Unit" }, { key: "bed", label: "Bed" }, { key: "status", label: "Reservation", format: "status" }, { key: "bookingFeeCollectedUgx", label: "Booking fee", format: "money" }, { key: "depositCollectedUgx", label: "Deposit", format: "money" }, { key: "paymentMethod", label: "Payment method" }, { key: "reservedExpiresAt", label: "Reserved until", format: "date" }, { key: "bookedAt", label: "Booked", format: "date" }, { key: "createdAt", label: "Created", format: "date" },
    ]} /></SectionCard>{data && <div className="mt-3"><Freshness asOf={data.asOf} /></div>}</>;
}
