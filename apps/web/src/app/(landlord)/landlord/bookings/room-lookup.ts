import { getMyProperties, getPropertyDetail } from "@/lib/landlord";

export type RoomInfo = { label: string; propertyName: string; roomCategory: string; pricePerTermUgx: number };

/** Bed id -> its room, for showing which room a reservation or booking is for.
 * Shared by the Reservations and Bookings pages. */
export async function roomsByBedId(): Promise<Map<string, RoomInfo>> {
  const properties = await getMyProperties();
  const details = await Promise.all(properties.map((p) => getPropertyDetail(p.id)));
  const map = new Map<string, RoomInfo>();
  details.forEach((detail, i) => {
    for (const room of detail?.rooms ?? []) {
      for (const bed of room.beds) {
        map.set(bed.id, {
          label: room.label,
          propertyName: properties[i].name,
          roomCategory: room.roomCategory,
          pricePerTermUgx: room.pricePerTermUgx,
        });
      }
    }
  });
  return map;
}
