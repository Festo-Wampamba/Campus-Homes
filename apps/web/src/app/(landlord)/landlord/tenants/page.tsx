import type { Metadata } from "next";
import { Info, Users } from "lucide-react";

import { getLandlordReservations, getMyProperties, getPropertyDetail } from "@/lib/landlord";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { TenantsList } from "./tenants-list";

export const metadata: Metadata = { title: "Tenants" };

export default async function LandlordTenantsPage() {
  const [reservations, properties] = await Promise.all([getLandlordReservations(), getMyProperties()]);
  const details = await Promise.all(properties.map((p) => getPropertyDetail(p.id)));

  const roomsByUnitId = new Map<string, { label: string; propertyName: string }>();
  details.forEach((detail, i) => {
    for (const room of detail?.rooms ?? []) {
      roomsByUnitId.set(room.id, { label: room.label, propertyName: properties[i].name });
    }
  });

  const occupants = reservations.filter((r) => r.status === "fulfilled");

  return (
    <>
      <h1 className="text-2xl">Tenants</h1>
      <p className="mt-1 text-sm text-muted-foreground">Students currently in one of your rooms.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{occupants.length}</p>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          Student names aren&apos;t shared here — a room&apos;s reservation only tells you it&apos;s
          occupied. Use Messages to talk to the tenant in a room once they reach out.
        </p>
      </div>

      <div className="mt-6">
        {occupants.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No tenants yet"
            body="Once a booking is fully paid and confirmed, the room shows here as occupied."
          />
        ) : (
          <TenantsList occupants={occupants} roomsByUnitId={roomsByUnitId} />
        )}
      </div>
    </>
  );
}
