import type { Metadata } from "next";
import { Info, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { WalkInStudentButton } from "@/components/landlord/walk-in-student-dialog";
import { formatUgx } from "@/lib/format";
import { getMyProperties } from "@/lib/landlord";
import { getLandlordTenants } from "@/lib/tenants";
import { freeBedsForWalkIn } from "../bookings/room-lookup";
import { SignUpQrSection } from "./sign-up-qr-section";
import { TenantsList } from "./tenants-list";

export const metadata: Metadata = { title: "Tenants" };

export default async function LandlordTenantsPage({ searchParams }: { searchParams: Promise<{ property?: string }> }) {
  const { property: chosenPropertyId } = await searchParams;
  const [tenants, freeBeds, properties] = await Promise.all([getLandlordTenants(), freeBedsForWalkIn(), getMyProperties()]);
  const list = tenants ?? [];
  const movedIn = list.filter((t) => t.status === "occupied").length;
  const paidUgx = list.reduce((sum, t) => sum + t.paidUgx, 0);
  const owedUgx = list.reduce((sum, t) => sum + Math.max(t.balanceUgx, 0), 0);
  const stats = [
    { label: "Moved in", value: String(movedIn) },
    { label: "Booked, not moved in", value: String(list.length - movedIn) },
    { label: "Paid so far", value: formatUgx(paidUgx) },
    { label: "Still owed", value: formatUgx(owedUgx), owed: owedUgx > 0 },
  ];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">Tenants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Students booked into or living in your rooms, with what each has paid. A student who came to you in person? Add them here and give them a room.
          </p>
        </div>
        <WalkInStudentButton beds={freeBeds} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className={`text-2xl font-bold tabular-nums ${stat.owed ? "text-destructive" : ""}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          You see contact details only for students in your own rooms, to run their stay. Keep them private.
          Paid adds up every payment recorded for the booking; record each new payment so the balance stays right.
        </p>
      </div>

      <div className="mt-6">
        <SignUpQrSection
          properties={properties.map(({ id, name }) => ({ id, name }))}
          initialPropertyId={chosenPropertyId}
        />
      </div>

      <div className="mt-6">
        {tenants === null ? (
          <p role="alert" className="text-sm text-destructive">Couldn&apos;t load your tenants. Refresh the page to try again.</p>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No tenants yet"
            body="Once a booking is confirmed, the student shows here with their room and payments."
          />
        ) : (
          <TenantsList tenants={list} />
        )}
      </div>

    </>
  );
}
