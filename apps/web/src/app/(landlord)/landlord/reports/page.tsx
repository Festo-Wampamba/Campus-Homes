import type { Metadata } from "next";

import { getLandlordReservations, getMyProperties, getPropertyDetail } from "@/lib/landlord";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Reports & Analytics" };

export default async function LandlordReportsPage() {
  const [properties, reservations] = await Promise.all([getMyProperties(), getLandlordReservations()]);
  const details = await Promise.all(properties.map((p) => getPropertyDetail(p.id)));
  const rooms = details.flatMap((d) => d?.rooms ?? []);

  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.reservationStatus === "fulfilled").length;
  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : null;
  const activeBookings = reservations.filter(
    (r) => r.status === "held" || r.status === "payment_pending",
  ).length;

  return (
    <>
      <h1 className="text-2xl">Reports & Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">A snapshot of how your properties are doing.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{properties.length}</p>
            <p className="text-xs text-muted-foreground">Properties</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{totalRooms}</p>
            <p className="text-xs text-muted-foreground">Total rooms</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{occupancyRate === null ? "—" : `${occupancyRate}%`}</p>
            <p className="text-xs text-muted-foreground">Occupancy rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{activeBookings}</p>
            <p className="text-xs text-muted-foreground">Active bookings</p>
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Earnings trends and booking-duration analytics arrive alongside Phase 2 payments.
      </p>
    </>
  );
}
