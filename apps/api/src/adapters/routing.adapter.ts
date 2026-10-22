// RoutingAdapter — road distance and drive time between two points, behind an
// interface so the provider is swappable. Google Routes (Festo, 2026-10-22):
// the same roads and numbers students see in Google Maps.

export interface LatLon {
  lat: number;
  lon: number;
}

export interface DrivingRoute {
  distanceMeters: number;
  durationSeconds: number;
}

export interface RoutingAdapter {
  /** The provider's best driving route, or null when it has none. */
  drivingRoute(origin: LatLon, destination: LatLon): Promise<DrivingRoute | null>;
}

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TIMEOUT_MS = 4000;

const waypoint = ({ lat, lon }: LatLon) => ({ location: { latLng: { latitude: lat, longitude: lon } } });

export class GoogleRoutes implements RoutingAdapter {
  constructor(private readonly apiKey: string) {}

  async drivingRoute(origin: LatLon, destination: LatLon): Promise<DrivingRoute | null> {
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        // Only the two fields we store: a field mask is required, and asking
        // for less keeps the request on the cheapest billing tier.
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify({
        origin: waypoint(origin),
        destination: waypoint(destination),
        travelMode: 'DRIVE',
        // Typical drive time, not live traffic: the value is stored and
        // reused, so a rush-hour snapshot would mislead later readers.
        routingPreference: 'TRAFFIC_UNAWARE',
        computeAlternativeRoutes: false,
        units: 'METRIC',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Never echo the response body: it can include request details.
    if (!res.ok) throw new Error(`Google Routes failed: HTTP ${res.status}`);
    return parseRoutesResponse(await res.json());
  }
}

/** Google returns `{}` (no routes) when the points can't be connected by road. */
export function parseRoutesResponse(body: unknown): DrivingRoute | null {
  const route = (body as { routes?: { distanceMeters?: unknown; duration?: unknown }[] } | null)?.routes?.[0];
  if (!route) return null;
  const distanceMeters = Number(route.distanceMeters);
  const durationSeconds = typeof route.duration === 'string' ? Number.parseFloat(route.duration) : Number.NaN;
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return null;
  }
  return { distanceMeters: Math.round(distanceMeters), durationSeconds: Math.round(durationSeconds) };
}

/** No key configured: no road distance is shown (never a made-up number). */
export class NoRouting implements RoutingAdapter {
  drivingRoute(): Promise<DrivingRoute | null> {
    return Promise.resolve(null);
  }
}
