import type { StudentReservationView } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

export function getMyReservations(): Promise<StudentReservationView[]> {
  return apiServer<StudentReservationView[]>("/reservations/mine").then((rows) => rows ?? []);
}
