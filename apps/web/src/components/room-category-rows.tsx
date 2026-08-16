"use client";

import { Plus, Trash2 } from "lucide-react";
import { ROOM_CATEGORIES, type RoomCategory } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roomCategoryLabel } from "@/lib/format";

export type RoomCategoryRow = {
  // Local-only key for React reconciliation — never sent to the API.
  key: string;
  category: RoomCategory;
  roomCount: string;
  pricePerTermUgx: string;
  // Optional — not every property charges a deposit.
  depositUgx: string;
};

let nextKey = 0;
export function emptyRoomCategoryRow(): RoomCategoryRow {
  nextKey += 1;
  return { key: `row-${nextKey}`, category: "single", roomCount: "", pricePerTermUgx: "", depositUgx: "" };
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
}: {
  rows: RoomCategoryRow[];
  onChange: (rows: RoomCategoryRow[]) => void;
  idPrefix: string;
}) {
  function update(key: string, patch: Partial<RoomCategoryRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function remove(key: string) {
    onChange(rows.filter((row) => row.key !== key));
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div
          key={row.key}
          className="grid grid-cols-2 items-end gap-2 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,5.5rem)_minmax(0,8rem)_minmax(0,8rem)_auto]"
        >
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label htmlFor={`${idPrefix}-category-${i}`}>Room type</Label>
            <select
              id={`${idPrefix}-category-${i}`}
              value={row.category}
              onChange={(e) => update(row.key, { category: e.target.value as RoomCategory })}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10"
            >
              {ROOM_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {roomCategoryLabel(category)}
                </option>
              ))}
            </select>
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
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-price-${i}`}>Price / semester (UGX)</Label>
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
