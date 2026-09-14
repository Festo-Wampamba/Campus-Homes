import type { Property } from "@campushomes/shared";

export type BathroomType = "ensuite" | "shared" | "private_external" | "unspecified";

export type RoomTypeStatus =
  | "draft"
  | "pending_review"
  | "visit_required"
  | "approved"
  | "rejected";

export type ChangeSetStatus =
  | "draft"
  | "pending_review"
  | "visit_required"
  | "approved"
  | "rejected"
  | "cancelled";

export type UnitBlockReason =
  | "maintenance"
  | "renovation"
  | "damaged_utilities"
  | "offline_allocation"
  | "safety"
  | "owner_hold"
  | "other";

export type DerivedOccupancyStatus =
  | "available"
  | "partially_occupied"
  | "fully_occupied"
  | "blocked";

export type BedspaceStatus =
  | "available"
  | "reserved"
  | "booked"
  | "occupied"
  | "blocked";

export interface RoomTypePhoto {
  id: string;
  storageKey: string;
  sortOrder: number;
  isPrimary: boolean;
  uploadedBy?: string;
  createdAt?: string;
}

export interface RoomTypeVersion {
  id: string;
  roomTypeId: string;
  versionNumber: number;
  title: string;
  category: string;
  bathroomType: BathroomType;
  capacity: number;
  sizeSqm?: number | null;
  description?: string | null;
  amenities: string[];
  semesterId: string;
  pricePerTermUgx: number;
  depositUgx?: number | null;
  status: RoomTypeStatus;
  rejectionReason?: string | null;
  reviewerNotes?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  photos: RoomTypePhoto[];
}

export interface RoomType {
  id: string;
  propertyId: string;
  currentVersionId?: string | null;
  currentVersion: RoomTypeVersion | null;
  pendingVersion?: RoomTypeVersion | null;
  attachedRoomsCount: number;
  createdAt: string;
}

export interface Bedspace {
  id: string;
  unitId: string;
  label: string;
  blocked: boolean;
  blockedReason?: string | null;
  status: BedspaceStatus;
  studentName?: string | null;
  studentPhone?: string | null;
  reservationId?: string | null;
  reservedExpiresAt?: string | null;
  bookedAt?: string | null;
}

export interface UnitBlock {
  id: string;
  unitId: string;
  reason: UnitBlockReason;
  startsAt: string;
  endsAt?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  clearedAt?: string | null;
}

export interface RoomUnit {
  id: string;
  propertyId: string;
  roomTypeId: string;
  roomTypeTitle: string;
  roomCategory: string;
  roomCode: string;
  buildingName?: string | null;
  floorLabel?: string | null;
  capacity: number;
  totalBeds: number;
  occupiedBeds: number;
  derivedStatus: DerivedOccupancyStatus;
  activeBlock?: UnitBlock | null;
  pendingChanges?: boolean;
  beds: Bedspace[];
}

export interface RoomInventoryChangeSet {
  id: string;
  propertyId: string;
  semesterId: string;
  status: ChangeSetStatus;
  submittedAt?: string | null;
  reviewerNotes?: string | null;
  rejectionReason?: string | null;
  physicalRoomChangesCount: number;
  roomTypeChangesCount: number;
}

export interface RoomManagementSummary {
  totalRooms: number;
  totalBeds: number;
  availableBeds: number;
  partiallyOccupiedRooms: number;
  fullyOccupiedRooms: number;
  blockedRooms: number;
}

export interface RoomManagementOverview {
  property: Property;
  properties: Property[];
  currentSemester: { id: string; name: string };
  semesters: { id: string; name: string }[];
  summary: RoomManagementSummary;
  changeSet: RoomInventoryChangeSet | null;
  roomTypes: RoomType[];
  rooms: RoomUnit[];
}

export const BATHROOM_TYPE_LABELS: Record<BathroomType, string> = {
  ensuite: "Ensuite (Private inside room)",
  shared: "Shared Bathroom (Corridor)",
  private_external: "Private Bathroom (Dedicated outside room)",
  unspecified: "Unspecified Bathroom Type",
};

export const UNIT_BLOCK_REASONS: Array<{ value: UnitBlockReason; label: string }> = [
  { value: "maintenance", label: "Routine Maintenance" },
  { value: "renovation", label: "Room Renovation" },
  { value: "damaged_utilities", label: "Damaged Utilities (Plumbing / Power)" },
  { value: "offline_allocation", label: "Offline Tenant Allocation" },
  { value: "safety", label: "Safety / Emergency Hold" },
  { value: "owner_hold", label: "Owner Hold" },
  { value: "other", label: "Other Reason" },
];

export function deriveRoomStatus(
  beds: Bedspace[],
  activeBlock?: UnitBlock | null,
): DerivedOccupancyStatus {
  if (activeBlock) return "blocked";
  const activeBeds = beds.filter((b) => !b.blocked);
  if (activeBeds.length === 0) return "blocked";

  const occupiedCount = activeBeds.filter(
    (b) => b.status === "occupied" || b.status === "booked" || b.status === "reserved",
  ).length;

  if (occupiedCount === 0) return "available";
  if (occupiedCount >= activeBeds.length) return "fully_occupied";
  return "partially_occupied";
}
