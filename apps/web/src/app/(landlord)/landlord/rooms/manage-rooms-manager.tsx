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

  // Optimistic updates give instant feedback, but router.refresh() re-fetches
  // the server data without re-seeding these useState values. Reconcile from
  // fresh props whenever a refresh hands us a new initialData object — using
  // React's render-time "reset state on prop change" pattern (not an effect)
  // so the draft change-set banner (and its Submit button) surfaces after
  // adding rooms, and server-bridged rooms appear.
  const [syncedData, setSyncedData] = useState(initialData);
  if (syncedData !== initialData) {
    setSyncedData(initialData);
    setChangeSet(initialData.changeSet);
    setRoomTypes(initialData.roomTypes);
    setRooms(initialData.rooms);
  }

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
        {([
          { label: "Total Rooms", value: metrics.totalRooms, caption: "Physical units", Icon: DoorClosed, tone: "muted", title: "Every physical room on this property for the selected semester. Click to see the full list." },
          { label: "Total Beds", value: metrics.totalBeds, caption: "Total capacity", Icon: Bed, tone: "muted", title: "Total bedspaces across all rooms — the maximum students you can house. Click to see the list." },
          { label: "Available Beds", value: metrics.availableBeds, caption: "Ready to reserve", Icon: CheckCircle2, tone: "teal", title: "Bedspaces that are free and not blocked — students can reserve these now. Click to see the list." },
          { label: "Partially Full", value: metrics.partiallyOccupiedRooms, caption: "Has free beds", Icon: Clock, tone: "amber", title: "Rooms with some beds taken and some still free. Click to see the list." },
          { label: "Fully Booked", value: metrics.fullyOccupiedRooms, caption: "100% occupied", Icon: Layers, tone: "muted", title: "Rooms where every bed is occupied. Click to see the list." },
          { label: "Maintenance", value: metrics.blockedRooms, caption: "Offline blocks", Icon: Wrench, tone: "destructive", title: "Rooms taken offline by a maintenance block — not reservable until cleared. Click to see the list." },
        ] as const).map((card) => {
          const tone = {
            muted: { box: "border-border bg-card", head: "text-muted-foreground", value: "text-foreground", caption: "text-muted-foreground" },
            teal: { box: "border-teal-200/80 bg-teal-50/40 dark:border-teal-900/60 dark:bg-teal-950/20", head: "text-teal-800 dark:text-teal-300", value: "text-teal-700 dark:text-teal-400", caption: "text-teal-900/70 dark:text-teal-300/70" },
            amber: { box: "border-amber-200/80 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20", head: "text-amber-800 dark:text-amber-300", value: "text-amber-700 dark:text-amber-400", caption: "text-amber-900/70 dark:text-amber-300/70" },
            destructive: { box: "border-destructive/20 bg-destructive-subtle/30", head: "text-destructive", value: "text-destructive", caption: "text-destructive/80" },
          }[card.tone];
          return (
            <button
              key={card.label}
              type="button"
              title={card.title}
              onClick={() => handleTabChange("rooms")}
              className={`rounded-xl border ${tone.box} p-4 text-left shadow-xs transition-colors hover:border-teal-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600`}
            >
              <div className={`flex items-center justify-between ${tone.head}`}>
                <span className="text-xs font-semibold">{card.label}</span>
                <card.Icon className="size-4" />
              </div>
              <p className={`text-2xl font-bold font-mono ${tone.value} mt-2 tabular-nums`}>{card.value}</p>
              <span className={`text-[11px] ${tone.caption} mt-0.5 block`}>{card.caption}</span>
            </button>
          );
        })}
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
