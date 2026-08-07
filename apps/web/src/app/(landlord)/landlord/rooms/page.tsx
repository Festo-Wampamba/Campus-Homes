import type { Metadata } from "next";
import { BedDouble } from "lucide-react";

import { getMyProperties, getPropertyDetail } from "@/lib/landlord";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { RoomsList } from "./rooms-list";

export const metadata: Metadata = { title: "Rooms" };

export default async function LandlordRoomsPage() {
  const properties = await getMyProperties();
  const details = await Promise.all(properties.map((p) => getPropertyDetail(p.id)));

  const rows = details.flatMap((detail, i) =>
    (detail?.rooms ?? []).map((room) => ({ room, propertyName: properties[i].name })),
  );

  const total = rows.length;
  const available = rows.filter((r) => r.room.reservationStatus === null).length;
  const occupied = rows.filter((r) => r.room.reservationStatus === "fulfilled").length;
  const pending = rows.filter(
    (r) => r.room.reservationStatus === "held" || r.room.reservationStatus === "payment_pending",
  ).length;

  return (
    <>
      <h1 className="text-2xl">Rooms</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every room across your properties, in one place.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground">Total rooms</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-success">{available}</p>
            <p className="text-xs text-muted-foreground">Available</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{occupied}</p>
            <p className="text-xs text-muted-foreground">Occupied</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-warning">{pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        {total === 0 ? (
          <EmptyState
            icon={BedDouble}
            title="No rooms yet"
            body="Ops adds rooms once a property passes verification and is published. Check My Properties for status."
          />
        ) : (
          <RoomsList rows={rows} />
        )}
      </div>
    </>
  );
}
