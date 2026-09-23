"use client";

import { Plus, Trash2 } from "lucide-react";
import { ROOM_CATEGORIES, type RoomCategory } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roomCategoryLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RoomCategoryRow = {
  // Local-only key for React reconciliation — never sent to the API.
  key: string;
  category: RoomCategory;
  // Free-text room type, only meaningful when category is 'other'.
  customLabel: string;
  roomCount: string;
  pricePerTermUgx: string;
  // Optional — not every property charges a deposit.
  depositUgx: string;
  // Only rendered/meaningful when the caller passes showSelfContained — the
  // same category can appear as two rows (self-contained doubles at one
  // price, shared-bathroom doubles at another) rather than needing a
  // separate, disconnected "how many are self-contained" total elsewhere.
  selfContained: boolean;
  // Ops publish form only (2026-09 permanent rooms): existing physical room
  // ids this row represents, when it was pre-filled from the property's
  // already-created rooms rather than typed fresh. `roomCount` beds worth
  // get zipped against these at submit time — the first N reuse an existing
  // room (just priced for this semester), any extra create new ones.
  unitIds?: string[];
  // Ops publish form only: bed spaces in each room of this row. Fixed for
  // single/double/triple/quad; set by the lead for the variable types.
  bedsPerRoom?: string;
};

// Mirrors roomTypeInputSchema's fixed capacities (shared/room-management.ts).
export const FIXED_BEDS_PER_ROOM: Partial<Record<RoomCategory, number>> = {
  single: 1,
  double: 2,
  triple: 3,
  quad: 4,
};

export function bedsPerRoom(row: RoomCategoryRow): number {
  return FIXED_BEDS_PER_ROOM[row.category] ?? (Number(row.bedsPerRoom) || 1);
}

let nextKey = 0;
export function emptyRoomCategoryRow(): RoomCategoryRow {
  nextKey += 1;
  return {
    key: `row-${nextKey}`,
    category: "single",
    customLabel: "",
    roomCount: "",
    pricePerTermUgx: "",
    depositUgx: "",
    selfContained: false,
  };
}

/** Repeatable {category, room count, price} rows — the shared input for "I
 * have 30 singles at 300k, 40 doubles at 700k". Used by both the landlord
 * onboarding wizard (proposal) and the Ops publish form (authoritative).
 * The same category can appear more than once (e.g. two double price tiers),
 * so this is a plain array, not one row per category. */
export function RoomCategoryRows({
  rows,
  onChange,
  idPrefix,
  showSelfContained = false,
  showBeds = false,
}: {
  rows: RoomCategoryRow[];
  onChange: (rows: RoomCategoryRow[]) => void;
  idPrefix: string;
  // Landlord-facing forms only — the Ops publish form doesn't use this flag,
  // so it stays hidden there rather than showing a checkbox with no effect.
  showSelfContained?: boolean;
  // Ops publish form: per-row "Beds per room" input.
  showBeds?: boolean;
}) {
  function update(key: string, patch: Partial<RoomCategoryRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function remove(key: string) {
    onChange(rows.filter((row) => row.key !== key));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Price is per bed, not per room — for a Double or Triple, enter what one bed costs, the same
        number you&apos;d quote a student moving into just one space in that room.
      </p>
      {rows.map((row, i) => (
        <div
          key={row.key}
          className={cn(
            "grid grid-cols-2 items-end gap-2 rounded-md border border-border p-3",
            showBeds
              ? "sm:grid-cols-3"
              : showSelfContained
                ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,5.5rem)_minmax(0,8rem)_minmax(0,8rem)_auto_auto]"
                : "sm:grid-cols-[minmax(0,1fr)_minmax(0,5.5rem)_minmax(0,8rem)_minmax(0,8rem)_auto]",
          )}
        >
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label htmlFor={`${idPrefix}-category-${i}`}>Room type</Label>
            <select
              id={`${idPrefix}-category-${i}`}
              value={row.category}
              onChange={(e) => update(row.key, { category: e.target.value as RoomCategory })}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10"
            >
              {ROOM_CATEGORIES.filter(
                // The self-contained checkbox already covers this; keep the
                // option only for a legacy row that already uses it.
                (category) => !showSelfContained || category !== "self_contained" || category === row.category,
              ).map((category) => (
                <option key={category} value={category}>
                  {roomCategoryLabel(category)}
                </option>
              ))}
            </select>
            {row.category === "other" && (
              <Input
                aria-label="Custom room type"
                value={row.customLabel}
                maxLength={40}
                placeholder="e.g. Penthouse suite"
                onChange={(e) => update(row.key, { customLabel: e.target.value })}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-count-${i}`}>Rooms</Label>
            <Input
              id={`${idPrefix}-count-${i}`}
              type="number"
              min={1}
              max={500}
              inputMode="numeric"
              value={row.roomCount}
              onChange={(e) => update(row.key, { roomCount: e.target.value })}
            />
          </div>
          {showBeds && (
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-beds-${i}`}>Beds per room</Label>
              <Input
                id={`${idPrefix}-beds-${i}`}
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                // Fixed types always sleep their named count; existing rooms
                // keep their beds (change those through room management).
                disabled={FIXED_BEDS_PER_ROOM[row.category] !== undefined || Boolean(row.unitIds?.length)}
                value={FIXED_BEDS_PER_ROOM[row.category] ?? row.bedsPerRoom ?? "1"}
                onChange={(e) => update(row.key, { bedsPerRoom: e.target.value })}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-price-${i}`}>Price per bed / semester (UGX)</Label>
            <Input
              id={`${idPrefix}-price-${i}`}
              type="number"
              min={1}
              inputMode="numeric"
              value={row.pricePerTermUgx}
              onChange={(e) => update(row.key, { pricePerTermUgx: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-deposit-${i}`}>Deposit (UGX, optional)</Label>
            <Input
              id={`${idPrefix}-deposit-${i}`}
              type="number"
              min={0}
              inputMode="numeric"
              value={row.depositUgx}
              onChange={(e) => update(row.key, { depositUgx: e.target.value })}
            />
          </div>
          <div className={cn("col-span-2 flex items-center justify-between gap-2", !showBeds && "contents")}>
            {showSelfContained && (
              <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-1">
                <input
                  type="checkbox"
                  checked={row.selfContained}
                  onChange={(e) => update(row.key, { selfContained: e.target.checked })}
                />
                Self-contained
              </label>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove room type"
              onClick={() => remove(row.key)}
            >
              <Trash2 aria-hidden className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No room types added yet.</p>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...rows, emptyRoomCategoryRow()])}
      >
        <Plus aria-hidden className="size-4" />
        Add another room type
      </Button>
    </div>
  );
}
