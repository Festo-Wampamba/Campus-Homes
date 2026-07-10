import type { Reservation } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

export function getMyReservations(): Promise<Reservation[]> {
  return apiServer<Reservation[]>("/reservations/mine").then((rows) => rows ?? []);
}
