import { UGANDA_GPS_BOUNDS } from "@campushomes/shared";

export interface Coordinates {
  lat: number;
  lon: number;
}

// One coordinate: decimal ("0.329167", "-0.5") or degrees/minutes/seconds in
// any common spelling ("0°19′45″N", "0 19 45 N", "32°33'12\"E", "N0°19.75'"),
// with an optional N/S/E/W hemisphere letter before or after.
const PART = String.raw`([NSEW])?\s*(-?\d+(?:\.\d+)?)\s*(?:[°º˚d]\s*|\s+)?(?:(\d+(?:\.\d+)?)\s*(?:['′’m]\s*|\s+)?)?(?:(\d+(?:\.\d+)?)\s*(?:["″”s]|'')?)?\s*([NSEW])?`;
const PAIR = new RegExp(String.raw`^\s*${PART}\s*[,;\s]\s*${PART}\s*$`, "i");

function toDecimal(
  hemiBefore: string | undefined,
  deg: string,
  min: string | undefined,
  sec: string | undefined,
  hemiAfter: string | undefined,
): { value: number; hemi: string | null } | null {
  const minutes = min ? Number(min) : 0;
  const seconds = sec ? Number(sec) : 0;
  if (minutes >= 60 || seconds >= 60) return null;
  const degrees = Number(deg);
  const magnitude = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  const hemi = (hemiBefore ?? hemiAfter ?? "").toUpperCase() || null;
  const negative = deg.startsWith("-") || hemi === "S" || hemi === "W";
  return { value: negative ? -magnitude : magnitude, hemi };
}

/**
 * Parses what Ops people actually paste: Google Maps' "0.329167, 32.5525",
 * Google Earth/phone DMS "0°19′45″N 32°33′12″E", or either with N/S/E/W.
 * Returns null when the text isn't a latitude/longitude pair. Rounds to 6
 * decimals (~10 cm), the precision the visit record keeps.
 */
export function parseCoordinates(text: string): Coordinates | null {
  const match = PAIR.exec(text.trim());
  if (!match) return null;
  const first = toDecimal(match[1], match[2], match[3], match[4], match[5]);
  const second = toDecimal(match[6], match[7], match[8], match[9], match[10]);
  if (!first || !second) return null;
  // Lat first by convention; hemisphere letters can say otherwise.
  const swapped = first.hemi === "E" || first.hemi === "W" || second.hemi === "N" || second.hemi === "S";
  const [lat, lon] = swapped ? [second.value, first.value] : [first.value, second.value];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return { lat: round(lat), lon: round(lon) };
}

export function isInUganda({ lat, lon }: Coordinates): boolean {
  return lat >= UGANDA_GPS_BOUNDS.minLat && lat <= UGANDA_GPS_BOUNDS.maxLat
    && lon >= UGANDA_GPS_BOUNDS.minLon && lon <= UGANDA_GPS_BOUNDS.maxLon;
}
