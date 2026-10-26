"use client";

import type { ListingIntent } from "@campushomes/shared";

import { cn } from "@/lib/utils";

const OPTIONS: { value: ListingIntent; title: string; body: string }[] = [
  {
    value: "manage_only",
    title: "Manage it on CampusHomes",
    body: "Rooms, tenants, payments and receipts in one dashboard. Not shown to students.",
  },
  {
    value: "list",
    title: "Manage it and list it to students",
    body: "Everything above, plus a CampusHomes inspection visit before your rooms go live to students.",
  },
];

/** "What do you want to do with this property?" (0076). The landlord can
 * switch later from the property; taking a live listing down goes through Ops. */
export function ListingIntentChoice({
  value,
  onChange,
}: {
  value: ListingIntent;
  onChange: (value: ListingIntent) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-foreground">What do you want to do with this property?</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer gap-3 rounded-lg border p-4 text-sm transition-colors",
              value === option.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            )}
          >
            <input
              type="radio"
              name="listingIntent"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>
              <span className="block font-semibold text-foreground">{option.title}</span>
              <span className="mt-1 block text-muted-foreground">{option.body}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">You can change this later from your property.</p>
    </fieldset>
  );
}
