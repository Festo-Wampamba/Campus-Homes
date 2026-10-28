import { cache } from "react";

import { getMyProperties, getPropertyDetail } from "@/lib/landlord";

export type RoomInfo = { label: string; propertyName: string; roomCategory: string; pricePerTermUgx: number };

/** A bed a walk-in student can be put into straight away. */
export type WalkInBed = {
  id: string;
  propertyName: string;
  roomLabel: string;
  bedLabel: string;
  roomCategory: string;
  selfContained: boolean;
  /** The rent the student is booked at: the walk-in form's Total. */
  pricePerTermUgx: number;
};

// One fetch per request, shared by every lookup below (React server cache).
const loadPropertyRooms = cache(async () => {
  const properties = await getMyProperties();
  const details = await Promise.all(properties.map((p) => getPropertyDetail(p.id)));
  return properties.map((property, i) => ({ propertyName: property.name, rooms: details[i]?.rooms ?? [] }));
});

/** Bed id -> its room, for showing which room a reservation or booking is for.
 * Shared by the Reservations and Bookings pages. */
export async function roomsByBedId(): Promise<Map<string, RoomInfo>> {
  const map = new Map<string, RoomInfo>();
  for (const { propertyName, rooms } of await loadPropertyRooms()) {
    for (const room of rooms) {
      for (const bed of room.beds) {
        map.set(bed.id, {
          label: room.label,
          propertyName,
          roomCategory: room.roomCategory,
          pricePerTermUgx: room.pricePerTermUgx,
        });
      }
    }
  }
  return map;
}

/** Free beds: no live reservation, not blocked, and the room is open. */
export async function freeBedsForWalkIn(): Promise<WalkInBed[]> {
  const beds: WalkInBed[] = [];
  for (const { propertyName, rooms } of await loadPropertyRooms()) {
    for (const room of rooms) {
      if (room.operationalStatus !== "available" && room.operationalStatus !== "vacant") continue;
      for (const bed of room.beds) {
        if (bed.blocked || bed.status) continue;
        beds.push({
          id: bed.id,
          propertyName,
          roomLabel: room.label,
          bedLabel: bed.label,
          roomCategory: room.roomCategory,
          selfContained: room.selfContained,
          pricePerTermUgx: room.pricePerTermUgx,
        });
      }
    }
  }
  return beds;
}
