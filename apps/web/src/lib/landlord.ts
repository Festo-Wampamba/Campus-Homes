import type {
  LandlordProfileWithParticulars,
  LandlordReservationView,
  Property,
  PropertyDetail,
} from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

export function getLandlordProfile(): Promise<LandlordProfileWithParticulars | null> {
  return apiServer<LandlordProfileWithParticulars>("/landlords/me");
}

export function getMyProperties(): Promise<Property[]> {
  return apiServer<Property[]>("/listings/properties/mine").then((rows) => rows ?? []);
}

export function getLandlordReservations(): Promise<LandlordReservationView[]> {
  return apiServer<LandlordReservationView[]>("/reservations/landlord-inbox").then(
    (rows) => rows ?? [],
  );
}

export function getPropertyDetail(propertyId: string): Promise<PropertyDetail | null> {
  return apiServer<PropertyDetail>(`/listings/properties/${propertyId}/detail`);
}
