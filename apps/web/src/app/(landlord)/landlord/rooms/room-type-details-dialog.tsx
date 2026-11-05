"use client";

import NextImage from "next/image";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { StatusChip } from "@/components/status-chip";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { formatUgx, roomCategoryLabel } from "@/lib/format";
import { BATHROOM_TYPE_LABELS, UNIT_BLOCK_REASONS, type RoomType, type RoomTypeVersion, type RoomUnit, type UnitBlock } from "@/lib/room-management";

const STATUS = {
  available: "Available", partially_occupied: "Partially occupied", fully_occupied: "Fully allocated", blocked: "Blocked",
};
const VERSION_STATUS = { draft: "Draft", pending_review: "Pending review", visit_required: "Visit required", approved: "Approved", rejected: "Rejected" };
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(value));
const blockReason = (block: UnitBlock) => UNIT_BLOCK_REASONS.find((reason) => reason.value === block.reason)?.label ?? "Other reason";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-3"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-semibold tabular-nums">{children}</dd></div>;
}
function RoomStatus({ room }: { room: RoomUnit }) {
  return <StatusChip className="max-w-full whitespace-normal" tone={room.derivedStatus === "blocked" ? "destructive" : room.derivedStatus === "available" ? "success" : "warning"}>{STATUS[room.derivedStatus]}</StatusChip>;
}
function Specification({ version, semesters }: { version: RoomTypeVersion; semesters: { id: string; name: string }[] }) {
  const semester = semesters.find((item) => item.id === version.semesterId);
  const photos = [...version.photos].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
  return <div className="space-y-5">
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Fact label="Price per bed / semester">{formatUgx(version.pricePerTermUgx)}</Fact>
      <Fact label="Security deposit">{version.depositUgx == null ? "Not specified" : formatUgx(version.depositUgx)}</Fact>
      <Fact label="Beds per room">{version.capacity}</Fact>
      <Fact label="Room size">{version.sizeSqm == null ? "Not recorded" : `${version.sizeSqm} m²`}</Fact>
      <Fact label="Room category">{roomCategoryLabel(version.category)}</Fact>
      <Fact label="Bathroom">{BATHROOM_TYPE_LABELS[version.bathroomType]}</Fact>
      {semester && <Fact label="Pricing semester">{semester.name}</Fact>}
      <Fact label="Specification status">{VERSION_STATUS[version.status] ?? "Not recorded"}</Fact>
    </dl>
    <section><h3 className="font-semibold">Description</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{version.description?.trim() || "No description added."}</p></section>
    <section><h3 className="font-semibold">Amenities and features</h3>{version.amenities.length ? <ul className="mt-2 flex flex-wrap gap-2">{version.amenities.map((item) => <li key={item} className="max-w-full break-words rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">{item}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No amenities recorded.</p>}</section>
    <section><h3 className="font-semibold">Room photos</h3>{photos.length ? <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{photos.map((photo, index) => {
      const url = listingPhotoUrl(photo.storageKey, 800);
      return <figure key={photo.id} className="min-w-0"><div className="relative aspect-4/3 overflow-hidden rounded-lg border border-border bg-muted">{url ? <NextImage src={url} alt={`${version.title} — photo ${index + 1}`} fill sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" className="object-cover" /> : <p className="p-4 text-sm text-muted-foreground">Photo unavailable</p>}</div>{photo.isPrimary && <figcaption className="mt-1 text-xs text-muted-foreground">Cover photo</figcaption>}</figure>;
    })}</div> : <p className="mt-2 text-sm text-muted-foreground">No photos uploaded.</p>}</section>
  </div>;
}

export function RoomTypeDetailsDialog({ roomType, room, rooms, semesters = [], onClose }: {
  roomType: RoomType | null; room?: RoomUnit | null; rooms: RoomUnit[];
  semesters?: { id: string; name: string }[]; onClose: () => void;
}) {
  const version = roomType?.currentVersion ?? roomType?.pendingVersion;
  const pending = roomType?.pendingVersion;
  const linked = rooms.filter((item) => item.roomTypeId === (roomType?.id ?? room?.roomTypeId) && item.propertyId === (roomType?.propertyId ?? room?.propertyId));
  const available = linked.reduce((sum, item) => sum + (item.derivedStatus === "blocked" || item.pendingRemoval ? 0 : item.beds.filter((bed) => !bed.blocked && bed.status === "available").length), 0);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} aria-label="Room type details" size="xl" resizable>
    <DialogHeader className="gap-2 p-3 sm:p-5" title={version?.title ?? room?.roomTypeTitle ?? "Room type details"} onClose={onClose} />
    <DialogBody className="space-y-6">
      {room && <section aria-label={`Selected room ${room.roomCode}`} className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="break-words text-lg font-semibold">Room {room.roomCode}</h3><RoomStatus room={room} /></div>
        <p className="break-words text-sm text-muted-foreground">{room.buildingName || "Main building"}{room.floorLabel ? ` · ${room.floorLabel}` : ""}</p>
        <p className="text-sm font-semibold">{room.occupiedBeds} of {room.totalBeds} beds allocated</p>
        <p className="text-xs text-muted-foreground">Allocated beds include students who have moved in, confirmed bookings and temporary reservations.</p>
        {room.pendingChanges && <p className="text-sm text-warning">Room changes are staged for review.</p>}
        {room.pendingRemoval && <p className="text-sm text-destructive">Removal pending. This room is not counted as available here.</p>}
        <ul className="space-y-2">{room.beds.map((bed) => <li key={bed.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3 text-sm"><span className="break-words font-semibold">{bed.label}</span><span>{bed.blocked || bed.status === "blocked" ? "Blocked" : bed.status === "occupied" ? "Occupied" : bed.status === "booked" ? "Booked — awaiting move-in" : bed.status === "reserved" ? "Reserved — temporary hold" : room.derivedStatus === "blocked" ? "Blocked with room" : room.pendingRemoval ? "Removal pending" : "Available"}</span>{bed.blockedReason && <p className="w-full break-words text-muted-foreground">{bed.blockedReason}</p>}</li>)}</ul>
        {room.activeBlock && <div className="space-y-1 rounded-md bg-destructive/10 p-3 text-sm"><p className="font-semibold">{blockReason(room.activeBlock)}</p><p>From {date(room.activeBlock.startsAt)} EAT · {room.activeBlock.endsAt ? `until ${date(room.activeBlock.endsAt)} EAT` : "No scheduled end"}</p>{room.activeBlock.notes && <p className="whitespace-pre-wrap break-words">{room.activeBlock.notes}</p>}</div>}
        {room.scheduledBlocks?.map((block) => <div key={block.id} className="rounded-md border border-border p-3 text-sm"><p className="font-semibold">Scheduled: {blockReason(block)}</p><p>{date(block.startsAt)} EAT · {block.endsAt ? `until ${date(block.endsAt)} EAT` : "No scheduled end"}</p>{block.notes && <p className="whitespace-pre-wrap break-words">{block.notes}</p>}</div>)}
      </section>}
      <section className="space-y-3"><h3 className="font-semibold">This room type across the property</h3><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Physical rooms">{linked.length}</Fact><Fact label="Total beds">{linked.reduce((sum, item) => sum + item.totalBeds, 0)}</Fact><Fact label="Allocated beds">{linked.reduce((sum, item) => sum + item.occupiedBeds, 0)}</Fact><Fact label="Available beds">{available}</Fact>
      </dl></section>
      {version ? <section className="space-y-4" aria-label="Current room type specification"><h3 className="text-lg font-semibold">{roomType?.currentVersion ? "Current specification" : `${VERSION_STATUS[version.status] ?? "Proposed"} specification`}</h3><p className="text-sm text-muted-foreground">Prices are for one bed per semester, rather than the whole room.</p><Specification version={version} semesters={semesters} /></section> : <p className="text-sm text-muted-foreground">Room type specifications are unavailable. Room availability is shown above.</p>}
      {roomType?.currentVersion && pending && pending.id !== roomType.currentVersion.id && <details className="rounded-lg border border-warning/30 p-4"><summary className="cursor-pointer break-words font-semibold">Proposed changes · {VERSION_STATUS[pending.status]}</summary><div className="mt-4 space-y-4"><p className="text-sm text-muted-foreground">These proposed details do not replace the current specification until approved.</p>{pending.rejectionReason && <p className="break-words text-sm text-destructive">{pending.rejectionReason}</p>}<Specification version={pending} semesters={semesters} /></div></details>}
      <section className="space-y-3"><h3 className="font-semibold">Physical rooms using this type</h3>{linked.length ? <ul className="space-y-2">{linked.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><div className="min-w-0"><p className="break-words font-semibold">Room {item.roomCode}</p><p className="break-words text-muted-foreground">{item.buildingName || "Main building"}{item.floorLabel ? ` · ${item.floorLabel}` : ""} · {item.occupiedBeds} / {item.totalBeds} beds allocated</p></div><RoomStatus room={item} /></li>)}</ul> : <p className="text-sm text-muted-foreground">No physical rooms are attached yet.</p>}</section>
    </DialogBody>
    <DialogFooter className="flex-wrap [&>*]:h-auto [&>*]:min-h-11 [&>*]:whitespace-normal [&>*]:py-2"><Button type="button" onClick={onClose}>Close details</Button></DialogFooter>
  </Dialog>;
}
