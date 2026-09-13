import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getLandlordProfile, getMyProperties, getPropertyDetail } from "@/lib/landlord";
import { apiServer } from "@/lib/server-api";
import { KycBanner } from "@/components/kyc-banner";
import {
  deriveRoomStatus,
  fetchRoomManagementData,
  type Bedspace,
  type BedspaceStatus,
  type RoomManagementOverview,
  type RoomManagementSummary,
  type RoomType,
  type RoomUnit,
  type UnitBlock,
} from "@/lib/room-management";
import { ManageRoomsManager } from "./manage-rooms-manager";

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
  const selectedProperty =
    properties.find((p) => p.id === params.propertyId) ?? properties[0];

  // Fetch available semesters for this property's catchment
  const rawSemesters = await apiServer<{ id: string; name: string }[]>(
    `/listings/semesters?catchment=${selectedProperty.catchment}`,
  )
    .then((rows) => rows ?? [])
    .catch(() => []);

  const semesters =
    rawSemesters.length > 0
      ? rawSemesters
      : [{ id: "current", name: "Current Academic Term" }];

  const currentSemester =
    (params.semesterId ? semesters.find((s) => s.id === params.semesterId) : undefined) ??
    semesters[0];

  // Attempt to fetch from the dedicated room-management endpoint
  let overview = await fetchRoomManagementData(selectedProperty.id, currentSemester.id).catch(
    () => null,
  );

  // If backend room-management endpoint is not yet active, construct from property detail
  if (!overview) {
    const detail = await getPropertyDetail(selectedProperty.id).catch(() => null);

    // Group rooms by category to synthesize room types
    const rawRooms = detail?.rooms ?? [];
    const categoryMap = new Map<string, typeof rawRooms>();
    for (const r of rawRooms) {
      const list = categoryMap.get(r.roomCategory) ?? [];
      list.push(r);
      categoryMap.set(r.roomCategory, list);
    }

    const roomTypes: RoomType[] = Array.from(categoryMap.entries()).map(([cat, catRooms]) => {
      const first = catRooms[0];
      const photos = (first.photos ?? []).map((p, pIdx) => ({
        id: p.id,
        storageKey: p.storageKey,
        sortOrder: pIdx,
        isPrimary: pIdx === 0,
      }));

      const title =
        cat
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ") + " Room";

      return {
        id: `rt-${cat}`,
        propertyId: selectedProperty.id,
        currentVersionId: `rtv-${cat}`,
        currentVersion: {
          id: `rtv-${cat}`,
          roomTypeId: `rt-${cat}`,
          versionNumber: 1,
          title,
          category: cat,
          bathroomType: first.capacity > 1 ? "shared" : "ensuite",
          capacity: first.capacity,
          sizeSqm: null,
          description: null,
          amenities: ["Electricity", "Water"],
          semesterId: currentSemester.id,
          pricePerTermUgx: first.pricePerTermUgx,
          depositUgx: first.depositUgx,
          status: "approved",
          rejectionReason: null,
          reviewerNotes: null,
          submittedAt: null,
          reviewedAt: null,
          photos,
        },
        attachedRoomsCount: catRooms.length,
        createdAt: selectedProperty.createdAt,
      };
    });

    const rooms: RoomUnit[] = rawRooms.map((r) => {
      const matchingType = roomTypes.find((rt) => rt.currentVersion?.category === r.roomCategory);
      const beds: Bedspace[] = (r.beds ?? []).map((b, bIdx) => {
        const bedStatus: BedspaceStatus =
          b.status === "reserved" ||
          b.status === "booked" ||
          b.status === "occupied" ||
          b.status === "blocked"
            ? b.status
            : b.blocked
              ? "blocked"
              : "available";

        return {
          id: b.id || `${r.id}-bed-${bIdx + 1}`,
          unitId: r.id,
          label: b.label || `Bed ${bIdx + 1}`,
          blocked: Boolean(b.blocked),
          blockedReason: b.blockedReason ?? null,
          status: bedStatus,
          studentName: null,
          studentPhone: null,
          reservationId: b.reservationId ?? null,
          reservedExpiresAt: b.reservedExpiresAt ?? null,
          bookedAt: b.bookedAt ?? null,
        };
      });

      const activeBlock: UnitBlock | null =
        r.operationalStatus === "blocked" || r.operationalStatus === "under_maintenance"
          ? {
              id: `block-${r.id}`,
              unitId: r.id,
              reason: r.operationalStatus === "under_maintenance" ? "maintenance" : "owner_hold",
              startsAt: new Date().toISOString(),
              notes: "Operational block active",
            }
          : null;

      const derivedStatus = deriveRoomStatus(beds, activeBlock);

      return {
        id: r.id,
        propertyId: selectedProperty.id,
        roomTypeId: matchingType?.id ?? `rt-${r.roomCategory}`,
        roomTypeTitle: matchingType?.currentVersion?.title ?? r.roomCategory.replaceAll("_", " "),
        roomCategory: r.roomCategory,
        roomCode: r.label,
        buildingName: r.buildingName ?? null,
        floorLabel: r.floorLabel ?? null,
        capacity: r.capacity,
        totalBeds: beds.length || r.capacity,
        occupiedBeds: beds.filter((b) =>
          ["occupied", "booked", "reserved"].includes(b.status),
        ).length,
        derivedStatus,
        activeBlock,
        beds,
      };
    });

    const summary: RoomManagementSummary = {
      totalRooms: rooms.length,
      totalBeds: rooms.reduce((acc, r) => acc + r.totalBeds, 0),
      availableBeds: rooms.reduce((acc, r) => {
        if (r.derivedStatus === "blocked") return acc;
        return acc + r.beds.filter((b) => !b.blocked && b.status === "available").length;
      }, 0),
      partiallyOccupiedRooms: rooms.filter((r) => r.derivedStatus === "partially_occupied").length,
      fullyOccupiedRooms: rooms.filter((r) => r.derivedStatus === "fully_occupied").length,
      blockedRooms: rooms.filter((r) => r.derivedStatus === "blocked").length,
    };

    overview = {
      property: selectedProperty,
      properties,
      currentSemester,
      semesters,
      summary,
      changeSet: null,
      roomTypes,
      rooms,
    };
  }

  return (
    <>
      <KycBanner status={profile.kycStatus} />
      <div className="mt-6">
        <ManageRoomsManager
          key={`${selectedProperty.id}-${currentSemester.id}`}
          initialData={overview}
        />
      </div>
    </>
  );
}
