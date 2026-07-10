import type { LandlordProfile, Property } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

export function getLandlordProfile(): Promise<LandlordProfile | null> {
  return apiServer<LandlordProfile>("/landlords/me");
}

export function getMyProperties(): Promise<Property[]> {
  return apiServer<Property[]>("/listings/properties/mine").then((rows) => rows ?? []);
}
