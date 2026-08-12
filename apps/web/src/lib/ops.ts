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

import { apiServer } from "@/lib/server-api";

export function getQueue(): Promise<OpsQueueRow[]> {
  return apiServer<OpsQueueRow[]>("/ops/queue").then((rows) => rows ?? []);
}

export function getInspectors(): Promise<OpsInspector[]> {
  return apiServer<OpsInspector[]>("/ops/inspectors").then((rows) => rows ?? []);
}

export function getMyVisits(): Promise<OpsVisitMine[]> {
  return apiServer<OpsVisitMine[]>("/ops/visits/mine").then((rows) => rows ?? []);
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
