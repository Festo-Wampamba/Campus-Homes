import type {
  Campus,
  OpsInspector,
  OpsLandlordKycRow,
  OpsPropertyListing,
  OpsPublishableSemester,
  OpsQueueRow,
  OpsVisitDetail,
  OpsVisitMine,
} from "@campushomes/shared";

import { apiServer, apiServerStrict } from "@/lib/server-api";

// Deliberately not the swallow-errors-to-[] pattern the rest of this file
// uses — see apiServerStrict()'s comment. A lead needs to know the
// difference between "nothing to approve" and "the API didn't respond."
export function getQueue(): Promise<OpsQueueRow[]> {
  return apiServerStrict<OpsQueueRow[]>("/ops/queue");
}

export function getInspectors(): Promise<OpsInspector[]> {
  return apiServer<OpsInspector[]>("/ops/inspectors").then((rows) => rows ?? []);
}

export function getMyVisits(): Promise<OpsVisitMine[]> {
  return apiServer<OpsVisitMine[]>("/ops/visits/mine").then((rows) => rows ?? []);
}

export function getMyVisitHistory(): Promise<OpsVisitMine[]> {
  return apiServer<OpsVisitMine[]>("/ops/visits/mine/history").then((rows) => rows ?? []);
}

export function getVisitDetail(visitId: string): Promise<OpsVisitDetail | null> {
  return apiServer<OpsVisitDetail>(`/ops/visits/${visitId}`);
}

export function getPropertyListings(propertyId: string): Promise<OpsPropertyListing[]> {
  return apiServer<OpsPropertyListing[]>(`/ops/properties/${propertyId}/listings`).then(
    (rows) => rows ?? [],
  );
}

export function getPublishableSemesters(propertyId: string): Promise<OpsPublishableSemester[]> {
  return apiServer<OpsPublishableSemester[]>(
    `/ops/properties/${propertyId}/publishable-semesters`,
  ).then((rows) => rows ?? []);
}

export function getKycQueue(): Promise<OpsLandlordKycRow[]> {
  return apiServer<OpsLandlordKycRow[]>("/ops/landlords/kyc-queue").then((rows) => rows ?? []);
}

export function getCampuses(): Promise<Campus[]> {
  return apiServer<Campus[]>("/listings/campuses").then((rows) => rows ?? []);
}
