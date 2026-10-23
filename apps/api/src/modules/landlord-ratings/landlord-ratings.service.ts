import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';

import type {
  LandlordRating,
  LandlordRatingsSummary,
  MyLandlordRating,
  RateLandlordInput,
} from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';

type RatingRow = { rating: number; comment: string | null; created_at: Date };

const toRating = (row: RatingRow): LandlordRating => ({
  rating: row.rating,
  comment: row.comment,
  createdAt: row.created_at.toISOString(),
});

/** Students rate landlords (0073). Eligibility (reserved with the landlord and
 * messaged them) lives in SQL, student_can_rate_landlord(), and the insert
 * trigger re-checks it, so this service never decides it alone. */
@Injectable()
export class LandlordRatingsService {
  constructor(private readonly rlsDb: RlsDb) {}

  /** Eligibility needs service_role: the reservation chain (beds, units,
   * properties) has no student read policy. */
  mine(ctx: RlsContext, landlordId: string): Promise<MyLandlordRating> {
    return this.rlsDb.run({ userId: ctx.userId, role: 'service_role' }, async (_db, client) => {
      const row = (await client.query<{ can_rate: boolean } & Partial<RatingRow>>(
        `SELECT student_can_rate_landlord($1, $2) AS can_rate, lr.rating, lr.comment, lr.created_at
         FROM (SELECT 1) AS one
         LEFT JOIN landlord_ratings lr ON lr.student_id = $1 AND lr.landlord_id = $2`,
        [ctx.userId, landlordId],
      )).rows[0];
      const rating = row?.rating != null && row.created_at ? toRating(row as RatingRow) : null;
      // Ratings are append-only: once given, there is nothing left to rate.
      return { canRate: !rating && Boolean(row?.can_rate), rating };
    });
  }

  /** The student id comes from the session, never the request body. */
  async rate(ctx: RlsContext, input: RateLandlordInput): Promise<LandlordRating> {
    try {
      return await this.rlsDb.run({ userId: ctx.userId, role: 'service_role' }, async (_db, client) =>
        toRating((await client.query<RatingRow>(
          `INSERT INTO landlord_ratings (landlord_id, student_id, rating, comment)
           VALUES ($1, $2, $3, $4) RETURNING rating, comment, created_at`,
          [input.landlordId, ctx.userId, input.rating, input.comment || null],
        )).rows[0]!),
      );
    } catch (err) {
      const pg = err as { code?: string; cause?: { code?: string } };
      const code = pg.code ?? pg.cause?.code;
      if (code === '23505') throw new ConflictException('You have already rated this landlord');
      // 23514: the eligibility trigger; 23503: not a student or not a landlord.
      if (code === '23514' || code === '23503') {
        throw new ForbiddenException('You can rate a landlord after reserving at their hostel and messaging them');
      }
      throw err;
    }
  }

  /** Runs as the landlord: RLS (landlord_ratings_landlord_read) scopes the rows. */
  aboutMe(ctx: RlsContext): Promise<LandlordRatingsSummary> {
    return this.rlsDb.run(ctx, async (_db, client) => {
      const items = (await client.query<RatingRow>(
        `SELECT rating, comment, created_at FROM landlord_ratings
         WHERE landlord_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [ctx.userId],
      )).rows.map(toRating);
      const totals = (await client.query<{ average: number | null; count: number }>(
        `SELECT ROUND(AVG(rating), 1)::float8 AS average, COUNT(*)::int AS count
         FROM landlord_ratings WHERE landlord_id = $1`,
        [ctx.userId],
      )).rows[0];
      return { average: totals?.average ?? null, count: totals?.count ?? 0, items };
    });
  }
}
