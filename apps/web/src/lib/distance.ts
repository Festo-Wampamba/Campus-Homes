export type CoordinatePair = {
  lat: number | null | undefined;
  lon: number | null | undefined;
};

export type ValidCoordinates = { lat: number; lon: number };

/** Return coordinates only when both values are finite geographic points. */
export function validCoordinates(value: CoordinatePair | null | undefined): ValidCoordinates | null {
  if (
    !value ||
    typeof value.lat !== "number" ||
    typeof value.lon !== "number" ||
    !Number.isFinite(value.lat) ||
    !Number.isFinite(value.lon) ||
    value.lat < -90 ||
    value.lat > 90 ||
    value.lon < -180 ||
    value.lon > 180
  ) {
    return null;
  }
  return { lat: value.lat, lon: value.lon };
}

/** Haversine distance in metres; null means either endpoint is not usable. */
export function haversineDistanceMeters(
  from: CoordinatePair | null | undefined,
  to: CoordinatePair | null | undefined,
): number | null {
  const start = validCoordinates(from);
  const end = validCoordinates(to);
  if (!start || !end) return null;

  const radians = Math.PI / 180;
  const deltaLat = (end.lat - start.lat) * radians;
  const deltaLon = (end.lon - start.lon) * radians;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(start.lat * radians) * Math.cos(end.lat * radians) * Math.sin(deltaLon / 2) ** 2;
  const arc = Math.min(1, Math.max(0, a));
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export function formatDistance(metres: number | null): { kilometres: string; metres: string } | null {
  if (metres == null || !Number.isFinite(metres) || metres < 0) return null;
  const rounded = Math.round(metres);
  return {
    kilometres: (rounded / 1_000).toFixed(1),
    metres: rounded.toLocaleString("en-UG"),
  };
}

/** "10.0 km by road · about 25 min drive" (Google's fastest driving route). */
export function formatRoadTrip(distanceMeters: number, durationSeconds: number): string {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  const time = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  return `${(distanceMeters / 1000).toFixed(1)} km by road · about ${time} drive`;
}
