import type { Metadata } from "next";
import type { RoomChangeReviewItem } from "@campushomes/shared";

import { RoomChangeReviewManager } from "@/components/room-management/room-change-review-manager";
import { apiServerStrict } from "@/lib/server-api";

export const metadata: Metadata = { title: "Room change reviews" };

export default async function OpsRoomChangesPage() {
  const items = await apiServerStrict<RoomChangeReviewItem[]>("/ops/room-change-requests");
  return <><h1 className="text-2xl">Room change reviews</h1><p className="mt-1 text-sm text-muted-foreground">Approve room types and inventory changes before they become bookable.</p><RoomChangeReviewManager initialItems={items} canScheduleVisit /></>;
}
