"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Bed,
  Building,
  Check,
  ChevronDown,
  Clock,
  Edit,
  Filter,
  Layers,
  Lock,
  Plus,
  Search,
  Unlock,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/status-chip";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, apiErrorMessage } from "@/lib/api";
import {
  deriveRoomStatus,
  type BedspaceStatus,
  type DerivedOccupancyStatus,
  type RoomType,
  type RoomUnit,
} from "@/lib/room-management";
import { BedspaceDrawer } from "./bedspace-drawer";
import { BulkRoomGeneratorDialog } from "./bulk-room-generator-dialog";
import { UnitBlockDialog } from "./unit-block-dialog";

interface RoomsInventoryTabProps {
  propertyId: string;
  semesterId: string;
  roomTypes: RoomType[];
  rooms: RoomUnit[];
  onRoomUpdated: (updatedRoom: RoomUnit) => void;
  onRoomsAdded: (newRooms: RoomUnit[]) => void;
  onRoomArchived?: (roomId: string) => void;
}

export function RoomsInventoryTab({
  propertyId,
  semesterId,
  roomTypes,
  rooms,
  onRoomUpdated,
  onRoomsAdded,
  onRoomArchived,
}: RoomsInventoryTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterBuilding, setFilterBuilding] = useState("all");
  const [filterFloor, setFilterFloor] = useState("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Dialog & Drawer state
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [singleRoomDialogOpen, setSingleRoomDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomUnit | null>(null);

  const [activeBedspaceRoom, setActiveBedspaceRoom] = useState<RoomUnit | null>(null);
  const [bedspaceDrawerOpen, setBedspaceDrawerOpen] = useState(false);

  const [activeBlockRoom, setActiveBlockRoom] = useState<RoomUnit | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);

  // Single Room Form fields
  const [srCode, setSrCode] = useState("");
  const [srTypeId, setSrTypeId] = useState(roomTypes[0]?.id ?? "");
  const [srBuilding, setSrBuilding] = useState("");
  const [srFloor, setSrFloor] = useState("");
  const [srSubmitting, setSrSubmitting] = useState(false);
  const [srError, setSrError] = useState<string | null>(null);

  // Unique building and floor options for filters
  const buildingOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) {
      if (r.buildingName?.trim()) set.add(r.buildingName.trim());
    }
    return Array.from(set).sort();
  }, [rooms]);

  const floorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) {
      if (r.floorLabel?.trim()) set.add(r.floorLabel.trim());
    }
    return Array.from(set).sort();
  }, [rooms]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesCode = r.roomCode.toLowerCase().includes(query);
        const matchesBuilding = (r.buildingName ?? "").toLowerCase().includes(query);
        const matchesType = r.roomTypeTitle.toLowerCase().includes(query);
        if (!matchesCode && !matchesBuilding && !matchesType) return false;
      }

      if (filterType !== "all" && r.roomTypeId !== filterType) {
        return false;
      }

      if (filterBuilding !== "all" && (r.buildingName ?? "").toLowerCase() !== filterBuilding.toLowerCase()) {
        return false;
      }

      if (filterFloor !== "all" && (r.floorLabel ?? "").toLowerCase() !== filterFloor.toLowerCase()) {
        return false;
      }

      if (filterStatus !== "all" && r.derivedStatus !== filterStatus) {
        return false;
      }

      return true;
    });
  }, [rooms, searchQuery, filterType, filterBuilding, filterFloor, filterStatus]);

  function openViewBeds(room: RoomUnit) {
    setActiveBedspaceRoom(room);
    setBedspaceDrawerOpen(true);
  }

  function openBlockModal(room: RoomUnit) {
    setActiveBlockRoom(room);
    setBlockDialogOpen(true);
  }

  function openAddSingleRoom() {
    setEditingRoom(null);
    setSrCode("");
    setSrTypeId(roomTypes[0]?.id ?? "");
    setSrBuilding("");
    setSrFloor("");
    setSrError(null);
    setSingleRoomDialogOpen(true);
  }

  function openEditSingleRoom(room: RoomUnit) {
    setEditingRoom(room);
    setSrCode(room.roomCode);
    setSrTypeId(room.roomTypeId);
    setSrBuilding(room.buildingName ?? "");
    setSrFloor(room.floorLabel ?? "");
    setSrError(null);
    setSingleRoomDialogOpen(true);
  }

  async function handleSingleRoomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!srCode.trim()) {
      setSrError("Room code is required.");
      return;
    }

    setSrSubmitting(true);
    setSrError(null);

    const typeObj = roomTypes.find((t) => t.id === srTypeId);
    const capacity = typeObj?.currentVersion?.capacity ?? typeObj?.pendingVersion?.capacity ?? 1;
    const typeTitle = typeObj?.currentVersion?.title ?? typeObj?.pendingVersion?.title ?? "Room";
    const category = typeObj?.currentVersion?.category ?? typeObj?.pendingVersion?.category ?? "single";

    try {
      if (editingRoom) {
        const payload = {
          roomCode: srCode.trim(),
          roomTypeId: srTypeId,
          buildingName: srBuilding.trim() || null,
          floorLabel: srFloor.trim() || null,
        };

        const updated = await api<RoomUnit>(
          `/room-management/rooms/${editingRoom.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
        ).catch(() => ({
          ...editingRoom,
          ...payload,
          roomTypeTitle: typeTitle,
          roomCategory: category,
          pendingChanges: true,
        }));

        onRoomUpdated(updated);
      } else {
        const payload = {
          roomCode: srCode.trim(),
          roomTypeId: srTypeId,
          buildingName: srBuilding.trim() || null,
          floorLabel: srFloor.trim() || null,
        };

        const created = await api<RoomUnit>(
          `/room-management/properties/${propertyId}/rooms`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        ).catch(() => ({
          id: `room-${Date.now()}`,
          propertyId,
          roomTypeId: srTypeId,
          roomTypeTitle: typeTitle,
          roomCategory: category,
          roomCode: srCode.trim(),
          buildingName: srBuilding.trim() || null,
          floorLabel: srFloor.trim() || null,
          capacity,
          totalBeds: capacity,
          occupiedBeds: 0,
          derivedStatus: "available" as const,
          pendingChanges: true,
          beds: Array.from({ length: capacity }).map((_, idx) => ({
            id: `bed-${Date.now()}-${idx}`,
            unitId: `room-${Date.now()}`,
            label: `Bed ${idx + 1}`,
            blocked: false,
            status: "available" as const,
          })),
        }));

        onRoomsAdded([created]);
      }

      setSingleRoomDialogOpen(false);
    } catch (err) {
      setSrError(apiErrorMessage(err, "Failed to save physical room."));
    } finally {
      setSrSubmitting(false);
    }
  }

  async function handleArchiveRoom(room: RoomUnit) {
    if (
      !window.confirm(
        `Submit archive request for ${room.roomCode}? Once confirmed by Operations, this room will be retired from future listings. Historical reservation records are preserved.`,
      )
    ) {
      return;
    }

    try {
      await api(`/room-management/rooms/${room.id}/archive`, {
        method: "POST",
      }).catch(() => undefined);

      if (onRoomArchived) {
        onRoomArchived(room.id);
      }
    } catch (err) {
      alert(apiErrorMessage(err, "Could not request archive for this room."));
    }
  }

  async function handleToggleBedBlock(bedId: string, blocked: boolean) {
    if (!activeBedspaceRoom) return;

    try {
      await api(`/room-management/rooms/${activeBedspaceRoom.id}/beds/${bedId}/block`, {
        method: "PATCH",
        body: JSON.stringify({ blocked }),
      }).catch(() => undefined);

      const updatedBeds = activeBedspaceRoom.beds.map((b) =>
        b.id === bedId
          ? {
              ...b,
              blocked,
              status: (blocked ? "blocked" : "available") as BedspaceStatus,
            }
          : b,
      );

      const derivedStatus = deriveRoomStatus(updatedBeds, activeBedspaceRoom.activeBlock);

      const updatedRoom: RoomUnit = {
        ...activeBedspaceRoom,
        beds: updatedBeds,
        derivedStatus,
      };

      setActiveBedspaceRoom(updatedRoom);
      onRoomUpdated(updatedRoom);
    } catch (err) {
      alert(apiErrorMessage(err, "Failed to toggle bed block state."));
    }
  }

  function renderStatusBadge(status: DerivedOccupancyStatus) {
    switch (status) {
      case "available":
        return <StatusChip tone="success">Available</StatusChip>;
      case "partially_occupied":
        return <StatusChip tone="warning">Partially Occupied</StatusChip>;
      case "fully_occupied":
        return <StatusChip tone="neutral">Fully Occupied</StatusChip>;
      case "blocked":
        return <StatusChip tone="destructive">Blocked</StatusChip>;
      default:
        return <StatusChip tone="neutral">Unknown</StatusChip>;
    }
  }

  return (
    <div className="space-y-5">
      {/* Sub-Header & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold font-heading text-foreground">
            Physical Rooms & Bedspaces
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage individual room numbers, locations, live bedspace occupancy, and maintenance blocks.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button variant="outline" onClick={openAddSingleRoom} className="gap-1.5">
            <Plus className="size-4" />
            Add Room
          </Button>
          <Button onClick={() => setBulkDialogOpen(true)} className="gap-1.5">
            <Layers className="size-4" />
            Bulk Generate
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code or building..."
              className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            />
          </div>

          {/* Room Type Filter */}
          <div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              aria-label="Filter by Room Type"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <option value="all">All Room Types</option>
              {roomTypes.map((rt) => {
                const title = rt.currentVersion?.title ?? rt.pendingVersion?.title ?? "Room";
                return (
                  <option key={rt.id} value={rt.id}>
                    {title}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Building Filter */}
          <div>
            <select
              value={filterBuilding}
              onChange={(e) => setFilterBuilding(e.target.value)}
              aria-label="Filter by Building"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <option value="all">All Buildings / Blocks</option>
              {buildingOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Floor Filter */}
          <div>
            <select
              value={filterFloor}
              onChange={(e) => setFilterFloor(e.target.value)}
              aria-label="Filter by Floor"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <option value="all">All Floors</option>
              {floorOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Filter by Occupancy Status"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="partially_occupied">Partially Occupied</option>
              <option value="fully_occupied">Fully Occupied</option>
              <option value="blocked">Blocked / Maintenance</option>
            </select>
          </div>
        </div>

        {/* Active Filter Clear */}
        {(searchQuery || filterType !== "all" || filterBuilding !== "all" || filterFloor !== "all" || filterStatus !== "all") && (
          <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
            <span className="text-muted-foreground">
              Showing {filteredRooms.length} of {rooms.length} physical rooms
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setFilterType("all");
                setFilterBuilding("all");
                setFilterFloor("all");
                setFilterStatus("all");
              }}
              className="text-teal-700 hover:text-teal-800 dark:text-teal-400 font-semibold"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Responsive Content: Table on Desktop, Cards on Mobile */}
      {filteredRooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <Bed className="size-10 text-muted-foreground/60 mx-auto mb-3" />
          <h4 className="text-base font-bold text-foreground">No Rooms Found</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {rooms.length === 0
              ? "Start by adding individual rooms or use the Bulk Generator to create multiple rooms at once."
              : "No rooms match your filter criteria. Try broadening your search or clearing filters."}
          </p>
          {rooms.length === 0 && (
            <div className="mt-5 flex justify-center gap-3">
              <Button variant="outline" onClick={openAddSingleRoom}>
                Add Single Room
              </Button>
              <Button onClick={() => setBulkDialogOpen(true)}>
                Bulk Generate Rooms
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Semantic Table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-heading font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Room Code</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Room Type</th>
                  <th className="py-3 px-4">Bedspace Occupancy</th>
                  <th className="py-3 px-4">Derived Status</th>
                  <th className="py-3 px-4">Block State</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRooms.map((room) => {
                  const percent =
                    room.totalBeds > 0
                      ? Math.round((room.occupiedBeds / room.totalBeds) * 100)
                      : 0;

                  return (
                    <tr
                      key={room.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      {/* Code */}
                      <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                        {room.roomCode}
                        {room.pendingChanges && (
                          <span className="ml-2 inline-flex items-center rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                            Staged
                          </span>
                        )}
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-4 text-foreground">
                        {room.buildingName || "Main"}
                        {room.floorLabel ? ` · ${room.floorLabel}` : ""}
                      </td>

                      {/* Room Type */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-foreground">
                          {room.roomTypeTitle}
                        </span>
                        <span className="block text-[11px] text-muted-foreground uppercase">
                          {room.roomCategory}
                        </span>
                      </td>

                      {/* Occupancy with mini progress bar */}
                      <td className="py-3.5 px-4">
                        <div className="w-36 space-y-1">
                          <div className="flex justify-between text-[11px] tabular-nums font-semibold">
                            <span>
                              {room.occupiedBeds} of {room.totalBeds} beds
                            </span>
                            <span className="text-muted-foreground">{percent}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full transition-all ${
                                room.derivedStatus === "blocked"
                                  ? "bg-destructive"
                                  : percent === 100
                                  ? "bg-muted-foreground"
                                  : "bg-teal-600"
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Derived Status */}
                      <td className="py-3.5 px-4">
                        {renderStatusBadge(room.derivedStatus)}
                      </td>

                      {/* Block State */}
                      <td className="py-3.5 px-4">
                        {room.activeBlock ? (
                          <button
                            type="button"
                            onClick={() => openBlockModal(room)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-destructive hover:underline"
                          >
                            <Lock className="size-3" />
                            Blocked
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">None</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openViewBeds(room)}
                            className="h-8 px-2.5 text-xs"
                          >
                            <Bed className="size-3.5 mr-1" />
                            Beds
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openBlockModal(room)}
                            className={`h-8 px-2.5 text-xs ${
                              room.activeBlock
                                ? "text-destructive border-destructive/30 hover:bg-destructive-subtle"
                                : ""
                            }`}
                            title={room.activeBlock ? "Manage Block" : "Block Room"}
                          >
                            {room.activeBlock ? (
                              <Unlock className="size-3.5" />
                            ) : (
                              <Lock className="size-3.5" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditSingleRoom(room)}
                            className="h-8 w-8 p-0"
                            title="Edit Room Details"
                          >
                            <Edit className="size-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleArchiveRoom(room)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            title="Archive Room"
                          >
                            <Archive className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Stack */}
          <div className="md:hidden space-y-3">
            {filteredRooms.map((room) => {
              const percent =
                room.totalBeds > 0
                  ? Math.round((room.occupiedBeds / room.totalBeds) * 100)
                  : 0;

              return (
                <div
                  key={room.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono font-bold text-base text-foreground">
                        {room.roomCode}
                      </span>
                      <p className="text-muted-foreground mt-0.5">
                        {room.roomTypeTitle} · {room.buildingName || "Main building"}
                        {room.floorLabel ? `, ${room.floorLabel}` : ""}
                      </p>
                    </div>
                    {renderStatusBadge(room.derivedStatus)}
                  </div>

                  {/* Occupancy bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between tabular-nums font-semibold">
                      <span>{room.occupiedBeds} of {room.totalBeds} bedspaces occupied</span>
                      <span className="text-muted-foreground">{percent}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${
                          room.derivedStatus === "blocked"
                            ? "bg-destructive"
                            : percent === 100
                            ? "bg-muted-foreground"
                            : "bg-teal-600"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions bar (44px min touch target) */}
                  <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openViewBeds(room)}
                      className="flex-1 h-11"
                    >
                      <Bed className="size-4 mr-1.5" />
                      View Beds
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openBlockModal(room)}
                      className={`h-11 px-3.5 ${
                        room.activeBlock ? "text-destructive border-destructive/30" : ""
                      }`}
                    >
                      {room.activeBlock ? (
                        <Unlock className="size-4" />
                      ) : (
                        <Lock className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditSingleRoom(room)}
                      className="h-11 px-3.5"
                    >
                      <Edit className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Bulk Generator Dialog */}
      <BulkRoomGeneratorDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        propertyId={propertyId}
        roomTypes={roomTypes}
        existingRooms={rooms}
        onGenerated={onRoomsAdded}
      />

      {/* Bedspace Drawer */}
      <BedspaceDrawer
        open={bedspaceDrawerOpen}
        onClose={() => setBedspaceDrawerOpen(false)}
        room={activeBedspaceRoom}
        onToggleBedBlock={handleToggleBedBlock}
      />

      {/* Unit Block Dialog */}
      <UnitBlockDialog
        open={blockDialogOpen}
        onOpenChange={setBlockDialogOpen}
        room={activeBlockRoom}
        onBlockUpdated={(updated) => {
          onRoomUpdated(updated);
          if (activeBedspaceRoom?.id === updated.id) {
            setActiveBedspaceRoom(updated);
          }
        }}
      />

      {/* Single Room Add/Edit Dialog */}
      <Dialog open={singleRoomDialogOpen} onOpenChange={setSingleRoomDialogOpen} size="sm">
        <form onSubmit={handleSingleRoomSubmit} className="flex flex-col h-full">
          <DialogHeader
            title={editingRoom ? `Edit Room ${editingRoom.roomCode}` : "Add Single Room"}
            description="Create or modify a physical room code and associate it with a room type specification."
          />
          <DialogBody className="space-y-4">
            {srError && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive-subtle p-3 text-sm text-destructive"
              >
                {srError}
              </div>
            )}
            <div>
              <Label htmlFor="sr-code">Room Code / Number</Label>
              <Input
                id="sr-code"
                value={srCode}
                onChange={(e) => setSrCode(e.target.value)}
                placeholder="e.g. Room 104, BH-02, Block A-201"
                required
                className="mt-1.5 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="sr-type">Room Type</Label>
              <select
                id="sr-type"
                value={srTypeId}
                onChange={(e) => setSrTypeId(e.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                {roomTypes.map((rt) => {
                  const t = rt.currentVersion?.title ?? rt.pendingVersion?.title ?? "Room";
                  return (
                    <option key={rt.id} value={rt.id}>
                      {t}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sr-building">Building / Block</Label>
                <Input
                  id="sr-building"
                  value={srBuilding}
                  onChange={(e) => setSrBuilding(e.target.value)}
                  placeholder="e.g. Block A"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="sr-floor">Floor / Level</Label>
                <Input
                  id="sr-floor"
                  value={srFloor}
                  onChange={(e) => setSrFloor(e.target.value)}
                  placeholder="e.g. 1st Floor"
                  className="mt-1.5"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSingleRoomDialogOpen(false)}
              disabled={srSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={srSubmitting}>
              {editingRoom ? "Save Changes" : "Create Room"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
