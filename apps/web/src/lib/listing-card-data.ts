import type { ListingDetailResponse, ListingSearchResult } from "@campushomes/shared";
/** Project the public snapshot and live availability into the common card contract. */
export function listingCardData(detail: ListingDetailResponse): ListingSearchResult | null {
  const {property,listing,version,units,availability,photos} = detail;
  const beds = availability.filter(bed => bed.available);
  const freeIds = new Set(beds.map(bed => bed.unit_id));
  const eligible = units.filter(unit => freeIds.has(unit.id));
  if (!eligible.length || property.gps_lat == null || property.gps_lon == null) return null;
  const prices = eligible.map(unit => unit.pricePerTermUgx);
  const capacities = eligible.map(unit => unit.capacity);
  return {
    id:listing.id,property_id:property.id,semester_id:listing.semesterId,expires_at:listing.expiresAt,version_id:version.id,
    price_per_term_ugx:Math.min(...prices),max_price_per_term_ugx:Math.max(...prices),amenities:version.amenities,description:version.description,
    name:property.name,street_address:property.street_address,gps_lat:property.gps_lat,gps_lon:property.gps_lon,university:property.catchment ?? "other",
    gender_arrangement:property.gender_arrangement,photo_storage_key:photos.find(photo => photo.isPrimary)?.storageKey ?? photos[0]?.storageKey ?? null,
    min_capacity:Math.min(...capacities),max_capacity:Math.max(...capacities),unit_count:beds.length,room_count:eligible.length,
    room_categories:[...new Set(eligible.map(unit => unit.roomCategory))].map(category => ({category,price_per_term_ugx:Math.min(...eligible.filter(unit => unit.roomCategory === category).map(unit => unit.pricePerTermUgx)),unit_count:beds.filter(bed => eligible.find(unit => unit.id === bed.unit_id)?.roomCategory === category).length})),
    has_self_contained:eligible.some(unit => unit.selfContained),verified_at:listing.verifiedAt,
  };
}
