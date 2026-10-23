import { ACCESSIBILITY_FEATURE_OPTIONS, AMENITY_OPTIONS, SECURITY_FEATURE_OPTIONS, UTILITY_OPTIONS, humanizeKey } from "@/lib/format";

const labels = new Map([
  ...UTILITY_OPTIONS, ...SECURITY_FEATURE_OPTIONS, ...ACCESSIBILITY_FEATURE_OPTIONS, ...AMENITY_OPTIONS,
].map(option => [option.key, option.label]));

/** Shared by interactive amenities and server-rendered structured data. */
export function amenityLabel(key: string): string {
  return labels.get(key) ?? humanizeKey(key);
}
