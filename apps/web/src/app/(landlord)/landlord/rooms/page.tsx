import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getLandlordProfile, getMyProperties } from "@/lib/landlord";
import { apiServer } from "@/lib/server-api";
import { KycBanner } from "@/components/kyc-banner";
import { fetchRoomManagementData } from "@/lib/room-management-server";
import { ManageRoomsManager } from "./manage-rooms-manager";
import { ROOMS_PROPERTY_COOKIE } from "./rooms-property-cookie";

export const metadata: Metadata = {
  title: "Manage Rooms | CampusHomes",
  description: "Configure room types, specifications, physical room inventory, and bedspaces.",
};

interface PageProps {
  searchParams: Promise<{
    propertyId?: string;
    semesterId?: string;
    tab?: string;
  }>;
}

export default async function ManageRoomsPage({ searchParams }: PageProps) {
  const [profile, properties] = await Promise.all([getLandlordProfile(), getMyProperties()]);

  if (!profile || properties.length === 0) {
    redirect("/landlord/onboarding");
  }

  const params = await searchParams;
  // A link from a property wins; otherwise reopen the property last managed.
  const remembered = (await cookies()).get(ROOMS_PROPERTY_COOKIE)?.value;
  const selectedProperty =
    properties.find((p) => p.id === params.propertyId) ??
    properties.find((p) => p.id === remembered) ??
    properties[0];

  // Fetch available semesters for this property's catchment
  const rawSemesters = await apiServer<{ id: string; name: string }[]>(
    `/listings/semesters?catchment=${selectedProperty.catchment}`,
  )
    .then((rows) => rows ?? [])
    .catch(() => []);

  if (rawSemesters.length === 0) {
    throw new Error("No active semester is configured for this property.");
  }
  const semesters = rawSemesters;

  const currentSemester =
    (params.semesterId ? semesters.find((s) => s.id === params.semesterId) : undefined) ??
    semesters[0];

  const overview = await fetchRoomManagementData(selectedProperty.id, currentSemester.id);

  return (
    <>
      <KycBanner status={profile.kycStatus} hasLiveListing={properties.some((p) => p.hasLiveListing)} />
      <div className="mt-6">
        <ManageRoomsManager
          key={JSON.stringify([
            selectedProperty.id,
            currentSemester.id,
            overview.changeSet?.id,
            overview.changeSet?.status,
            overview.changeSet?.physicalRoomChangesCount,
            overview.changeSet?.roomTypeChangesCount,
            overview.rooms.map((room) => [room.id, room.pendingChanges, room.activeBlock?.id]),
            overview.roomTypes.map((roomType) => [roomType.id, roomType.currentVersion?.id, roomType.pendingVersion?.id]),
          ])}
          initialData={overview}
        />
      </div>
    </>
  );
}
