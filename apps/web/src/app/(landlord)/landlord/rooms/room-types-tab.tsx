"use client";

import { useState } from "react";
import NextImage from "next/image";
import {
  AlertCircle,
  Bath,
  Bed,
  Clock,
  Edit,
  Image as ImageIcon,
  Layers,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/status-chip";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatUgx } from "@/lib/format";
import {
  BATHROOM_TYPE_LABELS,
  type RoomType,
} from "@/lib/room-management";
import { RoomTypeDialog } from "./room-type-dialog";

interface RoomTypesTabProps {
  propertyId: string;
  semesterId: string;
  roomTypes: RoomType[];
  onRoomTypeSaved: (savedType: RoomType) => void;
}

export function RoomTypesTab({
  propertyId,
  semesterId,
  roomTypes,
  onRoomTypeSaved,
}: RoomTypesTabProps) {
  const [editingType, setEditingType] = useState<RoomType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleAdd() {
    setEditingType(null);
    setDialogOpen(true);
  }

  function handleEdit(rt: RoomType) {
    setEditingType(rt);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Tab Sub-Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold font-heading text-foreground">
            Room Type Specifications
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure blueprints, room categories, bathroom arrangements, and semester pricing. Physical rooms are linked to these specifications.
          </p>
        </div>
        <Button onClick={handleAdd} className="self-start sm:self-auto gap-2">
          <Plus className="size-4" />
          Add Room Type
        </Button>
      </div>

      {/* Room Types Grid */}
      {roomTypes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <Layers className="size-10 text-muted-foreground/60 mx-auto mb-3" />
          <h4 className="text-base font-bold text-foreground">No Room Types Configured</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Room types define your property’s offerings (e.g. Single Ensuite, Double Shared). Add your first room type to begin assigning physical rooms.
          </p>
          <Button onClick={handleAdd} className="mt-5 gap-2">
            <Plus className="size-4" />
            Add Room Type
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {roomTypes.map((rt) => {
            const activeVer = rt.currentVersion ?? rt.pendingVersion;
            const hasPendingProposal = Boolean(rt.pendingVersion && rt.currentVersion);
            const isRejected = rt.pendingVersion?.status === "rejected";

            const primaryPhoto =
              activeVer?.photos.find((p) => p.isPrimary) ?? activeVer?.photos[0];
            const photoUrl = primaryPhoto ? listingPhotoUrl(primaryPhoto.storageKey, 500) : null;

            return (
              <div
                key={rt.id}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-shadow hover:shadow-md flex flex-col"
              >
                {/* Image Header */}
                <div className="relative aspect-16/9 w-full overflow-hidden bg-muted/40">
                  {photoUrl ? (
                    <NextImage
                      src={photoUrl}
                      alt={activeVer?.title || "Room type"}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center text-muted-foreground/60">
                      <ImageIcon className="size-8 mb-1" />
                      <span className="text-xs">No photos uploaded</span>
                    </div>
                  )}

                  {/* Photo count badge */}
                  {(activeVer?.photos.length ?? 0) > 0 && (
                    <span className="absolute bottom-2 left-2 rounded-md bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-xs">
                      {activeVer?.photos.length} photo{activeVer?.photos.length === 1 ? "" : "s"}
                    </span>
                  )}

                  {/* Status Badge */}
                  <div className="absolute top-2 right-2">
                    {rt.currentVersion ? (
                      <StatusChip tone="success">Approved & Live</StatusChip>
                    ) : rt.pendingVersion?.status === "rejected" ? (
                      <StatusChip tone="destructive">Rejected</StatusChip>
                    ) : (
                      <StatusChip tone="warning">Pending Review</StatusChip>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-base font-bold font-heading text-foreground">
                        {activeVer?.title}
                      </h4>
                    </div>

                    <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wider font-semibold">
                      {activeVer?.category.replace("_", " ")}
                    </p>

                    {/* Price display */}
                    <div className="mt-3">
                      <p className="text-lg font-bold font-mono text-teal-700 dark:text-teal-400 tabular-nums">
                        {formatUgx(activeVer?.pricePerTermUgx ?? 0)}
                        <span className="text-xs font-normal text-muted-foreground">
                          {" "}
                          / bed / term
                        </span>
                      </p>
                      {activeVer?.depositUgx ? (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          Deposit: {formatUgx(activeVer.depositUgx)}
                        </p>
                      ) : null}
                    </div>

                    {/* Specs badges */}
                    <div className="mt-3.5 space-y-1.5 text-xs text-foreground">
                      <div className="flex items-center gap-2">
                        <Bath className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          {BATHROOM_TYPE_LABELS[activeVer?.bathroomType ?? "unspecified"]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Bed className="size-3.5 text-muted-foreground shrink-0" />
                        <span>{activeVer?.capacity} bedspaces per room</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Layers className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-teal-800 dark:text-teal-300">
                          {rt.attachedRoomsCount} physical room{rt.attachedRoomsCount === 1 ? "" : "s"} attached
                        </span>
                      </div>
                    </div>

                    {/* Dual-state pending banner */}
                    {hasPendingProposal && (
                      <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                        <p className="font-semibold flex items-center gap-1.5">
                          <Clock className="size-3.5" />
                          Proposed Changes Pending Review
                        </p>
                        <p className="mt-1 text-[11px] text-amber-900/80 dark:text-amber-200/80">
                          New price: {formatUgx(rt.pendingVersion?.pricePerTermUgx ?? 0)}/bed. Live rate remains active until approved.
                        </p>
                      </div>
                    )}

                    {/* Rejection Notice */}
                    {isRejected && rt.pendingVersion?.rejectionReason && (
                      <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive-subtle p-2.5 text-xs text-destructive">
                        <p className="font-semibold flex items-center gap-1.5">
                          <AlertCircle className="size-3.5" />
                          Changes Rejected
                        </p>
                        <p className="mt-1 text-[11px]">
                          {rt.pendingVersion.rejectionReason}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleEdit(rt)}
                      className="w-full gap-1.5"
                    >
                      <Edit className="size-3.5" />
                      {isRejected ? "Revise and Resubmit" : "Edit Specifications"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <RoomTypeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        propertyId={propertyId}
        semesterId={semesterId}
        roomType={editingType}
        onSaved={onRoomTypeSaved}
      />
    </div>
  );
}
