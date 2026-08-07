import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CalendarCheck, Clock, Plus, Wallet } from "lucide-react";

import { getLandlordProfile, getLandlordReservations, getMyProperties } from "@/lib/landlord";
import { KycBanner } from "@/components/kyc-banner";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";

export const metadata: Metadata = { title: "Landlord dashboard" };

const RESERVATION_STATUS_LABEL: Record<string, string> = {
  held: "Held",
  payment_pending: "Payment pending",
  fulfilled: "Occupied",
  cancelled: "Cancelled",
  expired: "Expired",
};

function reservationTone(status: string): "success" | "warning" | "neutral" {
  if (status === "fulfilled") return "neutral";
  if (status === "held" || status === "payment_pending") return "warning";
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

  const activeBookings = reservations.filter((r) => r.status === "held" || r.status === "payment_pending");
  const occupied = reservations.filter((r) => r.status === "fulfilled");
  const recent = reservations.slice(0, 5);

  return (
    <>
      <h1 className="text-2xl">Welcome back{profile.legalName ? `, ${profile.legalName.split(" ")[0]}` : ""}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s happening across your properties.</p>

      <div className="mt-6">
        <KycBanner status={profile.kycStatus} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Building2 aria-hidden className="size-8 text-teal-600" />
            <div>
              <p className="text-2xl font-bold">{properties.length}</p>
              <p className="text-xs text-muted-foreground">Properties</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CalendarCheck aria-hidden className="size-8 text-teal-600" />
            <div>
              <p className="text-2xl font-bold">{activeBookings.length}</p>
              <p className="text-xs text-muted-foreground">Active bookings</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock aria-hidden className="size-8 text-teal-600" />
            <div>
              <p className="text-2xl font-bold">{occupied.length}</p>
              <p className="text-xs text-muted-foreground">Occupied rooms</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wallet aria-hidden className="size-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold text-muted-foreground">—</p>
              <p className="text-xs text-muted-foreground">Earnings (Phase 2)</p>
            </div>
          </CardContent>
        </Card>
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

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Recent bookings</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No bookings yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-border rounded-md border border-border">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">Room {r.unitId.slice(0, 8)}</span>
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
