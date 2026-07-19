import type { University } from "@campushomes/shared";

export type CampusLocation = { code: University; name: string; lat: number; lon: number };

// Approximate campus centers for the Kampala-area launch catchment
// (PRODUCT.md) — used only to point the search map at the right
// neighborhood when a student browses by university, not as a precise
// address. KIU here is its Kampala (Kansanga) campus, not the separate
// Western/Ishaka campus.
export const CAMPUS_LOCATIONS: Partial<Record<University, CampusLocation>> = {
  MUK: { code: "MUK", name: "Makerere University", lat: 0.3345, lon: 32.5687 },
  MUBS: { code: "MUBS", name: "Makerere University Business School", lat: 0.3298, lon: 32.6117 },
  KIU: { code: "KIU", name: "Kampala International University", lat: 0.2827, lon: 32.6019 },
  KYU: { code: "KYU", name: "Kyambogo University", lat: 0.3678, lon: 32.6198 },
};
