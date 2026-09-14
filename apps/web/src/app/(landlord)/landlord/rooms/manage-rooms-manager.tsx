"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Bed,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DoorClosed,
  Layers,
  Send,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, apiErrorMessage } from "@/lib/api";
import type {
  RoomInventoryChangeSet,
  RoomManagementOverview,
  RoomType,
  RoomUnit,
} from "@/lib/room-management";
import { ChangeSetSubmitDialog } from "./change-set-submit-dialog";
import { RoomTypesTab } from "./room-types-tab";
import { RoomsInventoryTab } from "./rooms-inventory-tab";

interface ManageRoomsManagerProps {
  initialData: RoomManagementOverview;
}

export function ManageRoomsManager({ initialData }: ManageRoomsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"types" | "rooms">(
    (searchParams.get("tab") as "types" | "rooms") || "rooms",
  );

  const property = initialData.property;
  const properties = initialData.properties;
  const currentSemester = initialData.currentSemester;
  const semesters = initialData.semesters;

  const [changeSet, setChangeSet] = useState<RoomInventoryChangeSet | null>(
    initialData.changeSet,
  );
  const [roomTypes, setRoomTypes] = useState<RoomType[]>(initialData.roomTypes);
  const [rooms, setRooms] = useState<RoomUnit[]>(initialData.rooms);

  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [cancellingChangeSet, setCancellingChangeSet] = useState(false);

  // Derive dynamic summary metrics from current rooms state
  const metrics = useMemo(() => {
    const totalRooms = rooms.length;
    let totalBeds = 0;
    let availableBeds = 0;
    let partiallyOccupiedRooms = 0;
    let fullyOccupiedRooms = 0;
    let blockedRooms = 0;

    for (const r of rooms) {
      totalBeds += r.totalBeds;
      if (r.derivedStatus === "blocked") {
        blockedRooms++;
      } else {
        const activeBeds = r.beds.filter((b) => !b.blocked);
        const freeBeds = activeBeds.filter((b) => b.status === "available").length;
        availableBeds += freeBeds;

        if (r.derivedStatus === "partially_occupied") {
          partiallyOccupiedRooms++;
        } else if (r.derivedStatus === "fully_occupied") {
          fullyOccupiedRooms++;
        }
      }
    }

    return {
      totalRooms,
      totalBeds,
      availableBeds,
      partiallyOccupiedRooms,
      fullyOccupiedRooms,
      blockedRooms,
    };
  }, [rooms]);

  // URL synchronization for property and semester selection
  function handlePropertyChange(newPropertyId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("propertyId", newPropertyId);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSemesterChange(newSemesterId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("semesterId", newSemesterId);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleTabChange(tab: "types" | "rooms") {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function handleDiscardChangeSet() {
    if (!changeSet) return;
    if (
      !window.confirm(
        "Are you sure you want to discard your draft changes? Unsubmitted additions and price edits will be cleared.",
      )
    ) {
      return;
    }

    setCancellingChangeSet(true);
    try {
      await api(`/room-management/change-sets/${changeSet.id}/cancel`, {
        method: "POST",
      });

      setChangeSet(null);
      setRooms((prev) => prev.filter((r) => !r.pendingChanges));
      setRoomTypes((prev) =>
        prev.map((rt) => ({
          ...rt,
          pendingVersion: undefined,
        })),
      );
      router.refresh();
    } catch (err) {
      alert(apiErrorMessage(err, "Failed to discard draft changes."));
    } finally {
      setCancellingChangeSet(false);
    }
  }

  function onRoomTypeSaved(savedType: RoomType) {
    setRoomTypes((prev) => {
      const idx = prev.findIndex((t) => t.id === savedType.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = savedType;
        return next;
      }
      return [...prev, savedType];
    });

    router.refresh();
  }

  function onRoomUpdated(updatedRoom: RoomUnit) {
    setRooms((prev) =>
      prev.map((r) => (r.id === updatedRoom.id ? updatedRoom : r)),
    );
    router.refresh();
  }

  function onRoomsAdded(newRooms: RoomUnit[]) {
    setRooms((prev) => [...prev, ...newRooms]);
    router.refresh();
  }

  function onRoomArchived(roomId: string) {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Sticky Property & Semester Bar */}
      <div className="sticky top-0 z-20 -mx-4 -mt-6 sm:-mx-6 bg-card/95 backdrop-blur-md px-4 sm:px-6 py-4 border-b border-border shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground">
              Manage Rooms & Inventory
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Authoritative inventory control: room types, physical rooms, live bedspace occupancy, and maintenance blocks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Property Selector */}
            <div className="flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 shadow-xs">
              <Building2 className="size-4 text-teal-700 dark:text-teal-400 shrink-0" />
              <select
                value={property.id}
                onChange={(e) => handlePropertyChange(e.target.value)}
                aria-label="Select Property"
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester Selector */}
            <div className="flex items-center gap-1.5 rounded-lg border border-input bg-card px-3 py-1.5 shadow-xs">
              <Calendar className="size-4 text-muted-foreground shrink-0" />
              <select
                value={currentSemester.id}
                onChange={(e) => handleSemesterChange(e.target.value)}
                aria-label="Select Semester"
                className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
              >
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Review / Draft Change-Set Banner */}
      {changeSet && (
        <div className="rounded-xl border overflow-hidden shadow-xs transition-all animate-in fade-in">
          {changeSet.status === "draft" && (
            <div className="border-teal-500/30 bg-teal-50/70 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 dark:border-teal-900 dark:bg-teal-950/30">
              <div className="flex items-start gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-teal-600 text-white shrink-0 mt-0.5">
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <h4 className="text-sm font-bold font-heading text-teal-900 dark:text-teal-200">
                    Unsubmitted Inventory Staging ({changeSet.physicalRoomChangesCount} rooms, {changeSet.roomTypeChangesCount} type edits)
                  </h4>
                  <p className="text-xs text-teal-800/80 dark:text-teal-300/80 mt-0.5">
                    Your modifications are saved in draft. Submit to Operations to publish these rates and rooms to student search.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDiscardChangeSet}
                  disabled={cancellingChangeSet}
                  className="text-xs border-teal-200 hover:bg-teal-100/50 dark:border-teal-800"
                >
                  Discard Draft
                </Button>
                <Button
                  size="sm"
                  onClick={() => setSubmitDialogOpen(true)}
                  className="text-xs gap-1.5"
                >
                  <Send className="size-3.5" />
                  Submit for Ops Review
                </Button>
              </div>
            </div>
          )}

          {changeSet.status === "pending_review" && (
            <div className="border-amber-500/30 bg-amber-50/70 p-4 sm:p-5 flex items-start gap-3 dark:border-amber-900 dark:bg-amber-950/30">
              <span className="grid size-9 place-items-center rounded-lg bg-amber-500 text-white shrink-0 mt-0.5">
                <Clock className="size-4" />
              </span>
              <div>
                <h4 className="text-sm font-bold font-heading text-amber-950 dark:text-amber-200">
                  Inventory Changes Under Operations Review
                </h4>
                <p className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-0.5">
                  Submitted {changeSet.submittedAt ? new Date(changeSet.submittedAt).toLocaleDateString() : "recently"}. Existing verified listings remain live while Operations reviews this change set.
                </p>
              </div>
            </div>
          )}

          {changeSet.status === "visit_required" && (
            <div className="border-amber-500/30 bg-amber-50/70 p-4 sm:p-5 flex items-start gap-3 dark:border-amber-900 dark:bg-amber-950/30">
              <span className="grid size-9 place-items-center rounded-lg bg-amber-500 text-white shrink-0 mt-0.5">
                <AlertTriangle className="size-4" />
              </span>
              <div>
                <h4 className="text-sm font-bold font-heading text-amber-950 dark:text-amber-200">
                  Physical Verification Visit Required
                </h4>
                <p className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-0.5">
                  Because new rooms or capacity increases were submitted, an Operations inspector has been notified to schedule a brief on-site verification.
                </p>
              </div>
            </div>
          )}

          {changeSet.status === "rejected" && (
            <div className="border-destructive/30 bg-destructive-subtle/40 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-destructive text-white shrink-0 mt-0.5">
                  <AlertCircle className="size-4" />
                </span>
                <div>
                  <h4 className="text-sm font-bold font-heading text-destructive">
                    Change Set Revision Required
                  </h4>
                  <p className="text-xs text-foreground/80 mt-0.5">
                    {changeSet.rejectionReason || "Operations requested updates to your proposed room configurations."}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => setSubmitDialogOpen(true)}
                className="text-xs self-end sm:self-auto"
              >
                Revise & Resubmit
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Summary Metric Cards (6 Cards) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Physical Rooms */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Total Rooms</span>
            <DoorClosed className="size-4" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2 tabular-nums">
            {metrics.totalRooms}
          </p>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">Physical units</span>
        </div>

        {/* Total Bedspaces */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Total Beds</span>
            <Bed className="size-4" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2 tabular-nums">
            {metrics.totalBeds}
          </p>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">Total capacity</span>
        </div>

        {/* Available Beds */}
        <div className="rounded-xl border border-teal-200/80 bg-teal-50/40 p-4 shadow-xs dark:border-teal-900/60 dark:bg-teal-950/20">
          <div className="flex items-center justify-between text-teal-800 dark:text-teal-300">
            <span className="text-xs font-semibold">Available Beds</span>
            <CheckCircle2 className="size-4" />
          </div>
          <p className="text-2xl font-bold font-mono text-teal-700 dark:text-teal-400 mt-2 tabular-nums">
            {metrics.availableBeds}
          </p>
          <span className="text-[11px] text-teal-900/70 dark:text-teal-300/70 mt-0.5 block">Ready to reserve</span>
        </div>

        {/* Partially Occupied Rooms */}
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex items-center justify-between text-amber-800 dark:text-amber-300">
            <span className="text-xs font-semibold">Partially Full</span>
            <Clock className="size-4" />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400 mt-2 tabular-nums">
            {metrics.partiallyOccupiedRooms}
          </p>
          <span className="text-[11px] text-amber-900/70 dark:text-amber-300/70 mt-0.5 block">Has free beds</span>
        </div>

        {/* Fully Occupied */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold">Fully Booked</span>
            <Layers className="size-4" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2 tabular-nums">
            {metrics.fullyOccupiedRooms}
          </p>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">100% occupied</span>
        </div>

        {/* Blocked / Maintenance */}
        <div className="rounded-xl border border-destructive/20 bg-destructive-subtle/30 p-4 shadow-xs">
          <div className="flex items-center justify-between text-destructive">
            <span className="text-xs font-semibold">Maintenance</span>
            <Wrench className="size-4" />
          </div>
          <p className="text-2xl font-bold font-mono text-destructive mt-2 tabular-nums">
            {metrics.blockedRooms}
          </p>
          <span className="text-[11px] text-destructive/80 mt-0.5 block">Offline blocks</span>
        </div>
      </div>

      {/* Accessible WAI-ARIA Tabs */}
      <div className="space-y-6">
        <div
          role="tablist"
          aria-label="Manage Rooms Sections"
          className="flex border-b border-border text-sm font-semibold"
        >
          <button
            role="tab"
            id="tab-rooms"
            aria-selected={activeTab === "rooms"}
            aria-controls="panel-rooms"
            tabIndex={activeTab === "rooms" ? 0 : -1}
            onClick={() => handleTabChange("rooms")}
            className={`flex items-center gap-2 border-b-2 py-3 px-5 transition-colors ${
              activeTab === "rooms"
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <DoorClosed className="size-4" />
            <span>Rooms & Bedspaces</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono font-medium text-foreground">
              {rooms.length}
            </span>
          </button>

          <button
            role="tab"
            id="tab-types"
            aria-selected={activeTab === "types"}
            aria-controls="panel-types"
            tabIndex={activeTab === "types" ? 0 : -1}
            onClick={() => handleTabChange("types")}
            className={`flex items-center gap-2 border-b-2 py-3 px-5 transition-colors ${
              activeTab === "types"
                ? "border-teal-600 text-teal-700 dark:text-teal-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="size-4" />
            <span>Room Types</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono font-medium text-foreground">
              {roomTypes.length}
            </span>
          </button>
        </div>

        {/* Tab Panel 1: Rooms & Bedspaces */}
        <div
          role="tabpanel"
          id="panel-rooms"
          aria-labelledby="tab-rooms"
          hidden={activeTab !== "rooms"}
        >
          {activeTab === "rooms" && (
            <RoomsInventoryTab
              propertyId={property.id}
              roomTypes={roomTypes}
              rooms={rooms}
              onRoomUpdated={onRoomUpdated}
              onRoomsAdded={onRoomsAdded}
              onRoomArchived={onRoomArchived}
            />
          )}
        </div>

        {/* Tab Panel 2: Room Types */}
        <div
          role="tabpanel"
          id="panel-types"
          aria-labelledby="tab-types"
          hidden={activeTab !== "types"}
        >
          {activeTab === "types" && (
            <RoomTypesTab
              propertyId={property.id}
              semesterId={currentSemester.id}
              roomTypes={roomTypes}
              onRoomTypeSaved={onRoomTypeSaved}
            />
          )}
        </div>
      </div>

      {/* Change Set Submit Confirmation Dialog */}
      {changeSet && (
        <ChangeSetSubmitDialog
          open={submitDialogOpen}
          onOpenChange={setSubmitDialogOpen}
          changeSet={changeSet}
          onSubmitted={(updated) => {
            setChangeSet(updated);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
