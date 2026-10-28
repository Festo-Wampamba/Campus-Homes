import { landlordTenantSchema, type LandlordTenant } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

/** The landlord's booked and moved-in students with Total/Paid/Balance; null when the API failed. */
export async function getLandlordTenants(): Promise<LandlordTenant[] | null> {
  const raw = await apiServer<unknown>("/reservations/landlord-tenants");
  const parsed = landlordTenantSchema.array().safeParse(raw);
  return parsed.success ? parsed.data : null;
}
