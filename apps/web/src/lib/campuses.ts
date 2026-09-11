import type { University } from "@campushomes/shared";

export type CampusLocation = { code: University; name: string; lat: number; lon: number };

// Approximate campus centers for the Kampala-area launch catchment
// (PRODUCT.md) — used only to point the search map at the right
// neighborhood when a student browses by university, not as a precise
// address. KIU here is its Kampala (Kansanga) campus, not the separate
// Western/Ishaka campus.
//
// MUK-only for now (2026-09): MUBS/KIU/KYU are the eventual launch set but
// are hidden platform-wide (home pills, campus tabs, search dropdown) while
// MUK is the sole pilot university for first testing. This map is the one
// place that gates all of them — re-add an entry here to bring one back.
export const CAMPUS_LOCATIONS: Partial<Record<University, CampusLocation>> = {
  MUK: { code: "MUK", name: "Makerere University", lat: 0.3345, lon: 32.5687 },
};
