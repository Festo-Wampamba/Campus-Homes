import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, CalendarCheck, Clock, Plus, Wallet } from "lucide-react";

import { getLandlordProfile, getLandlordReservations, getMyProperties } from "@/lib/landlord";
import { bookingsTrend } from "@/lib/landlord-analytics";
import { KycBanner } from "@/components/kyc-banner";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { StatCard } from "@/components/landlord/analytics/stat-card";
import { BookingsTrendChart } from "@/components/landlord/analytics/bookings-trend-chart";

export const metadata: Metadata = { title: "Landlord dashboard" };

const RESERVATION_STATUS_LABEL: Record<string, string> = {
  reserved: "Reserved",
  booked: "Booked",
  occupied: "Occupied",
  released: "Released",
  cancelled: "Cancelled",
  expired: "Expired",
};

function reservationTone(status: string): "success" | "warning" | "neutral" {
  if (status === "occupied") return "neutral";
  if (status === "reserved" || status === "booked") return "warning";
  return "success";
}

export default async function LandlordDashboardPage() {
  const [profile, properties, reservations] = await Promise.all([
    getLandlordProfile(),
    getMyProperties(),
    getLandlordReservations(),
  ]);

  if (!profile || properties.length === 0) {
    redirect("/landlord/onboarding");
  }

  const activeBookings = reservations.filter((r) => r.status === "reserved" || r.status === "booked");
  const occupied = reservations.filter((r) => r.status === "occupied");
  const recent = reservations.slice(0, 5);
  const trend = bookingsTrend(reservations);

  return (
    <>
      <h1 className="text-2xl">Welcome back{profile.legalName ? `, ${profile.legalName.split(" ")[0]}` : ""}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s happening across your properties.</p>

      <div className="mt-6">
        <KycBanner status={profile.kycStatus} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Properties" value={String(properties.length)} icon={Building2} tone="teal" />
        <StatCard label="Active bookings" value={String(activeBookings.length)} icon={CalendarCheck} tone="teal" />
        <StatCard label="Occupied rooms" value={String(occupied.length)} icon={Clock} tone="coral" />
        <StatCard label="Earnings" value="—" detail="Arrives with Phase 2" icon={Wallet} tone="neutral" />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/landlord/properties" className={buttonVariants({ variant: "primary" })}>
          <Plus aria-hidden className="size-4" />
          Add new property
        </Link>
        <Link href="/landlord/bookings" className={buttonVariants({ variant: "secondary" })}>
          View bookings
        </Link>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Bookings, last 8 weeks</CardTitle>
            <CardDescription>New reservations placed on your units.</CardDescription>
          </div>
          <Link
            href="/landlord/reports"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900"
          >
            Full analytics
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </CardHeader>
        <BookingsTrendChart data={trend} />
      </Card>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Recent bookings</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No bookings yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-md border border-border">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">Bed {r.bedId.slice(0, 8)}</span>
                <StatusChip tone={reservationTone(r.status)}>
                  {RESERVATION_STATUS_LABEL[r.status] ?? r.status}
                </StatusChip>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
