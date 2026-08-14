"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Pencil, Plus, Search } from "lucide-react";
import type { Property } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";
import { PropertyDetailDialog } from "./property-detail-dialog";
import { PropertyFormDialog } from "./property-form-dialog";

const PROPERTY_STATUS_LABEL: Record<string, string> = {
  pending_kyc: "Awaiting verification",
  active: "Active",
  suspended: "Suspended",
};

const PAGE_SIZE = 12;

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        status === "active"
          ? "bg-accent text-teal-700"
          : status === "suspended"
            ? "bg-destructive/10 text-destructive"
            : "bg-warning-subtle text-warning",
      )}
    >
      {PROPERTY_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PropertyThumbnail({ property, className }: { property: Property; className?: string }) {
  const url = property.coverPhotoKey ? listingPhotoUrl(property.coverPhotoKey, 100) : null;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL
      <img src={url} alt="" className={cn("shrink-0 rounded-md object-cover", className)} />
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
          body="Add your first hostel to get started — our Ops team schedules a verification visit once it's submitted."
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
                        <StatusBadge status={property.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${property.name}`}
                          onClick={(e) => openEdit(property, e)}
                        >
                          <Pencil aria-hidden className="size-4" />
                        </Button>
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
                  <StatusBadge status={property.status} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${property.name}`}
                    onClick={(e) => openEdit(property, e)}
                  >
                    <Pencil aria-hidden className="size-4" />
                  </Button>
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
                  <PropertyThumbnail property={property} className="h-32 w-full rounded-none" />
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-sm font-semibold text-foreground">
                        {property.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">{property.streetAddress}</p>
                      <div className="mt-2">
                        <StatusBadge status={property.status} />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${property.name}`}
                      onClick={(e) => openEdit(property, e)}
                    >
                      <Pencil aria-hidden className="size-4" />
                    </Button>
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
