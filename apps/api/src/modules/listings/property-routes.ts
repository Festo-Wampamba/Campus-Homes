import { Inject, Injectable, Logger } from '@nestjs/common';

import type { DrivingRoute, LatLon, RoutingAdapter } from '../../adapters/routing.adapter';
import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';

export const ROUTING = Symbol('ROUTING');

const SERVICE_CTX: RlsContext = { userId: '00000000-0000-0000-0000-000000000000', role: 'service_role' };
// Coordinates are compared, not just the property id: an Ops correction to
// the hostel's GPS (or a moved campus point) must recompute the route.
const SAME_POINT = 1e-6;

/** Road route from a hostel to its campus: computed once, stored, reused. */
@Injectable()
export class PropertyRoutes {
  private readonly logger = new Logger(PropertyRoutes.name);

  constructor(
    private readonly rlsDb: RlsDb,
    @Inject(ROUTING) private readonly routing: RoutingAdapter,
  ) {}

  /** Never throws: a missing road distance must not break the listing page. */
  async forProperty(propertyId: string, university: string, origin: LatLon, destination: LatLon): Promise<DrivingRoute | null> {
    try {
      const cached = await this.rlsDb.run(SERVICE_CTX, (_db, client) =>
        client.query<{ origin_lat: number; origin_lon: number; dest_lat: number; dest_lon: number; distance_m: number; duration_s: number }>(
          `SELECT origin_lat, origin_lon, dest_lat, dest_lon, distance_m, duration_s
           FROM property_campus_routes WHERE property_id = $1 AND university = $2::university`,
          [propertyId, university],
        ).then((r) => r.rows[0]),
      );
      if (cached && near(cached.origin_lat, origin.lat) && near(cached.origin_lon, origin.lon)
        && near(cached.dest_lat, destination.lat) && near(cached.dest_lon, destination.lon)) {
        return { distanceMeters: cached.distance_m, durationSeconds: cached.duration_s };
      }
      const route = await this.routing.drivingRoute(origin, destination);
      if (!route) return null;
      await this.rlsDb.run(SERVICE_CTX, (_db, client) =>
        client.query(
          `INSERT INTO property_campus_routes
             (property_id, university, origin_lat, origin_lon, dest_lat, dest_lon, distance_m, duration_s, computed_at)
           VALUES ($1, $2::university, $3, $4, $5, $6, $7, $8, now())
           ON CONFLICT (property_id, university) DO UPDATE SET
             origin_lat = EXCLUDED.origin_lat, origin_lon = EXCLUDED.origin_lon,
             dest_lat = EXCLUDED.dest_lat, dest_lon = EXCLUDED.dest_lon,
             distance_m = EXCLUDED.distance_m, duration_s = EXCLUDED.duration_s,
             computed_at = now()`,
          [propertyId, university, origin.lat, origin.lon, destination.lat, destination.lon, route.distanceMeters, route.durationSeconds],
        ),
      );
      return route;
    } catch (err) {
      this.logger.warn(`Road route unavailable for property ${propertyId}: ${err instanceof Error ? err.message : 'unknown error'}`);
      return null;
    }
  }
}

function near(a: number, b: number) {
  return Math.abs(Number(a) - b) < SAME_POINT;
}
