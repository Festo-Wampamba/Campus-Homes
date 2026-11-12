import type { Metadata } from "next";
import type { RoomChangeReviewItem, RoomChangeActivityItem } from "@campushomes/shared";

import { RoomChangeReviewManager } from "@/components/room-management/room-change-review-manager";
import { apiServerStrict } from "@/lib/server-api";

export const metadata: Metadata = { title: "Room change reviews" };

export default async function AdminRoomChangesPage() {
  const [items, activity] = await Promise.all([
    apiServerStrict<RoomChangeReviewItem[]>("/ops/room-change-requests"),
    apiServerStrict<RoomChangeActivityItem[]>("/ops/room-change-requests/activity"),
  ]);
  return <><h1 className="text-2xl">Room change reviews</h1><p className="mt-1 text-sm text-muted-foreground">Arrange first-time inspections and review submissions. Follow later landlord updates without another approval.</p><RoomChangeReviewManager initialItems={items} initialActivity={activity} /></>;
}
