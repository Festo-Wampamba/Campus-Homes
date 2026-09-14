import "server-only";

import type { RoomManagementOverview } from "@/lib/room-management";
import { apiServerStrict } from "@/lib/server-api";

export function fetchRoomManagementData(propertyId: string, semesterId?: string) {
  const query = new URLSearchParams({ propertyId });
  if (semesterId) query.set("semesterId", semesterId);
  return apiServerStrict<RoomManagementOverview>(`/room-management?${query.toString()}`);
}
