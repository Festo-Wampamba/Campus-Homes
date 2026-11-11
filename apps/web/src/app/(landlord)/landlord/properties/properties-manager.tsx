"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BedDouble, Building2, ChevronLeft, ChevronRight, Pencil, Trash2, EyeOff, AlertTriangle, Plus, Search, Users } from "lucide-react";
import type { Property } from "@campushomes/shared";

import { api, apiErrorMessage } from "@/lib/api";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { PhotoTile } from "@/components/listing/photo-tile";
import { StatusChip } from "@/components/status-chip";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";
import { PropertyDetailDialog } from "./property-detail-dialog";
import { PropertyFormDialog } from "./property-form-dialog";
import { propertyStatusPresentation } from "./property-status";

/** Opens Manage Rooms already set to this property. */
function ManageRoomsLink({ property }: { property: Property }) {
  return (
    <Link
      href={`/landlord/rooms?propertyId=${property.id}`}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Manage rooms at ${property.name}`}
      title="Manage rooms"
      className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <BedDouble aria-hidden className="size-4" />
    </Link>
  );
}

function PropertyTeamLink({ property }: { property: Property }) {
  return <Link href={`/landlord/team?propertyId=${property.id}`} onClick={e => e.stopPropagation()}
    aria-label={`Manage team at ${property.name}`} title="Manage property team"
    className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
    <Users aria-hidden className="size-4" />
  </Link>;
}

const PAGE_SIZE = 12;

function PropertyStatusChip({ property }: { property: Property }) {
  const presentation = propertyStatusPresentation(property.status);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusChip tone={presentation.tone}>
        {presentation.label}
      </StatusChip>
      {property.listingIntent === "manage_only" && <StatusChip tone="neutral">Manage only</StatusChip>}
    </span>
  );
}

function PropertyThumbnail({ property, className, whole = false }: { property: Property; className?: string; whole?: boolean }) {
  // Card covers fill their frame; the card click opens the detail dialog,
  // where the cover is shown at its own shape and opens full screen.
  // The landlord's own cover wins; a live listing's cover fills in otherwise.
  const coverKey = property.coverPhotoKey ?? property.listingCoverPhotoKey ?? null;
  if (whole && coverKey) {
    return (
      <PhotoTile
        photos={[{ storageKey: coverKey }]}
        width={600}
        alt={`${property.name} cover photo`}
        interactive={false}
        className={cn("shrink-0", className)}
      />
    );
  }
  const url = coverKey ? listingPhotoUrl(coverKey, 100) : null;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL
      <img src={url} alt={`${property.name} cover photo`} className={cn("shrink-0 rounded-md object-cover", className)} />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700",
        className,
      )}
    >
      <Building2 aria-hidden className="size-5" />
    </span>
  );
}

export function PropertiesManager({ properties }: { properties: Property[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewing, setViewing] = useState<Property | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<ViewMode>("grid");

  const [action,setAction]=useState<{property:Property;kind:"delete"|"unpublish"}|null>(null);
  const [confirmName,setConfirmName]=useState("");
  const [ack,setAck]=useState(false);
  const [busy,setBusy]=useState(false);
  const [actionError,setActionError]=useState<string|null>(null);
  async function applyAction(){
    if(!action)return;setBusy(true);setActionError(null);
    try{await api(`/listings/properties/${action.property.id}/${action.kind}`,{method:"POST",...(action.kind==="delete"?{body:JSON.stringify({confirmationName:confirmName,acknowledgeIrreversible:ack})}:{})});setAction(null);router.refresh();}
    catch(error){setActionError(apiErrorMessage(error,"Could not update this property. Try again."));}finally{setBusy(false);}
  }
  function propertyActions(property:Property){return <span className="inline-flex flex-wrap gap-1" onClick={(e)=>e.stopPropagation()}>
    <Button type="button" variant="ghost" size="icon" aria-label={`Unpublish ${property.name}`} onClick={()=>{setActionError(null);setAction({property,kind:"unpublish"});}}><EyeOff aria-hidden className="size-4"/></Button>
    <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label={`Delete ${property.name}`} onClick={()=>{setConfirmName("");setAck(false);setActionError(null);setAction({property,kind:"delete"});}}><Trash2 aria-hidden className="size-4"/></Button>
  </span>;}

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter(
      (p) => p.name.toLowerCase().includes(q) || p.streetAddress.toLowerCase().includes(q),
    );
  }, [properties, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(property: Property, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(property);
    setFormOpen(true);
  }

  function openDetail(property: Property) {
    setViewing(property);
    setDetailOpen(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl">Your properties</h1>
        <Button type="button" onClick={openAdd}>
          <Plus aria-hidden className="size-4" />
          Add property
        </Button>
      </div>

      {properties.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={Building2}
          title="No properties yet"
          body="Add your first hostel to get started. Our Ops team schedules a verification visit once it's submitted."
          action={
            <Button type="button" onClick={openAdd}>
              <Plus aria-hidden className="size-4" />
              Add property
            </Button>
          }
        />
      ) : (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search by name or address…"
                className="pl-9"
              />
            </div>
            <ViewToggle view={view} onChange={setView} />
          </div>

          {filtered.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">No properties match “{query}”.</p>
          ) : view === "list" ? (
            <div className="mt-4 overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Property</th>
                    <th scope="col" className="px-4 py-2.5">Address</th>
                    <th scope="col" className="px-4 py-2.5">University</th>
                    <th scope="col" className="px-4 py-2.5">Status</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageRows.map((property) => (
                    <tr
                      key={property.id}
                      onClick={() => openDetail(property)}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                    >
                      <td className="flex items-center gap-2.5 px-4 py-3 font-semibold text-foreground">
                        <PropertyThumbnail property={property} className="size-8" />
                        {property.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{property.streetAddress}</td>
                      <td className="px-4 py-3 text-muted-foreground">{property.catchment}</td>
                      <td className="px-4 py-3">
                        <PropertyStatusChip property={property} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end">
                          <ManageRoomsLink property={property} />
                          <PropertyTeamLink property={property} />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${property.name}`}
                            onClick={(e) => openEdit(property, e)}
                          >
                            <Pencil aria-hidden className="size-4" />
                          </Button>
                      {propertyActions(property)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : view === "rows" ? (
            <div className="mt-4 divide-y divide-border rounded-md border border-border">
              {pageRows.map((property) => (
                <div
                  key={property.id}
                  onClick={() => openDetail(property)}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <PropertyThumbnail property={property} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{property.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {property.streetAddress} · {property.catchment}
                    </p>
                  </div>
                  <PropertyStatusChip property={property} />
                  <ManageRoomsLink property={property} />
                  <PropertyTeamLink property={property} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${property.name}`}
                    onClick={(e) => openEdit(property, e)}
                  >
                    <Pencil aria-hidden className="size-4" />
                  </Button>
                      {propertyActions(property)}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pageRows.map((property) => (
                <Card
                  key={property.id}
                  onClick={() => openDetail(property)}
                  className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
                >
                  <PropertyThumbnail property={property} whole className="h-40 w-full rounded-none" />
                  <CardContent className="flex flex-wrap items-start gap-2 p-4">
                    <div className="min-w-0 basis-full">
                      <h2 className="font-display text-sm font-semibold text-foreground">
                        {property.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">{property.streetAddress}</p>
                      <div className="mt-2">
                        <PropertyStatusChip property={property} />
                      </div>
                    </div>
                    <ManageRoomsLink property={property} />
                    <PropertyTeamLink property={property} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${property.name}`}
                      onClick={(e) => openEdit(property, e)}
                    >
                      <Pencil aria-hidden className="size-4" />
                    </Button>
                      {propertyActions(property)}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {currentPage + 1} of {pageCount}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft aria-hidden className="size-4" />
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight aria-hidden className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={action!==null} onOpenChange={(open)=>{if(!open&&!busy)setAction(null);}} dismissible={!busy} size="sm">
        <DialogHeader title={action?.kind==="delete"?"Permanently delete property?":"Unpublish property?"} onClose={()=>{if(!busy)setAction(null);}}/>
        <DialogBody className="space-y-4 text-sm">
          {action?.kind==="delete"?<><p className="flex gap-2 font-semibold text-destructive"><AlertTriangle aria-hidden className="size-5 shrink-0"/>This cannot be undone.</p><p>Deleting {action.property.name} permanently removes its rooms, bookings, tenant records and related operational data. Other properties and registered user accounts are kept.</p><label className="block">Type the property name to confirm<Input value={confirmName} onChange={(e)=>setConfirmName(e.target.value)} autoComplete="off"/></label><label className="flex gap-3"><input type="checkbox" checked={ack} onChange={(e)=>setAck(e.target.checked)}/>I understand this permanently deletes this property and its records.</label></>:<p>The property will be hidden from public listings. Its rooms, bookings and tenant records remain available to you.</p>}
          {actionError&&<p role="alert" className="text-destructive">{actionError}</p>}
        </DialogBody>
        <DialogFooter><Button variant="secondary" disabled={busy} onClick={()=>setAction(null)}>Cancel</Button><Button variant={action?.kind==="delete"?"destructive":"primary"} disabled={busy||(action?.kind==="delete"&&(!ack||confirmName!==action.property.name))} onClick={()=>void applyAction()}>{busy?"Working…":action?.kind==="delete"?"Permanently delete":"Unpublish"}</Button></DialogFooter>
      </Dialog>
      <PropertyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        property={editing}
        onSaved={() => router.refresh()}
      />
      <PropertyDetailDialog open={detailOpen} onOpenChange={setDetailOpen} property={viewing} />
    </>
  );
}
