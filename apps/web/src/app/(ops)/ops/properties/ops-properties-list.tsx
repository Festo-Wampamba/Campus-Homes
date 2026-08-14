"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { TenantAgreementBuilderDialog } from "@/components/tenant-agreement-builder-dialog";

// A subset of AdminDashboardService.properties()'s row shape — only what
// this picker needs to search/display, not the full admin inventory view.
export type OpsPropertyRow = {
  id: string;
  name: string;
  streetAddress: string;
  catchment: string;
  landlordName: string;
  status: string;
};

export function OpsPropertiesList({ rows }: { rows: OpsPropertyRow[] }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<OpsPropertyRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.landlordName?.toLowerCase().includes(q) ||
        row.streetAddress?.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="space-y-4">
      <label className="relative block max-w-md">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search property or landlord…"
          className="h-10 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm text-foreground shadow-xs transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </label>

      <div className="space-y-2">
        {filtered.map((row) => (
          <Card key={row.id} className="transition-colors hover:bg-muted/50">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{row.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {row.landlordName} · {row.streetAddress} · {row.catchment}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusChip tone={row.status === "active" ? "success" : "neutral"}>{row.status}</StatusChip>
                <button
                  type="button"
                  onClick={() => setEditing(row)}
                  className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  Tenant agreement
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No properties match this search.</p>
        )}
      </div>

      {editing && (
        <TenantAgreementBuilderDialog
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          propertyId={editing.id}
          propertyName={editing.name}
        />
      )}
    </div>
  );
}
