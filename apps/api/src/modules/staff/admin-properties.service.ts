import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type {
  AddAdminPropertyMediaInput,
  AddAdminPropertyUnitsInput,
  AdminUnitInput,
  CreateAdminPropertyInput,
  UpdateAdminPropertyInput,
} from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { AuditService } from '../ops/audit.service';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

@Injectable()
export class AdminPropertiesService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
  ) {}

  async create(actor: RlsContext, input: CreateAdminPropertyInput) {
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query('BEGIN');
      try {
        const landlord = (await client.query(`
          SELECT l.user_id FROM landlords l JOIN users u ON u.id = l.user_id
          WHERE l.user_id = $1 AND u.deleted_at IS NULL
        `, [input.landlordId])).rows[0];
        if (!landlord) throw new BadRequestException('Select a user with an active landlord profile');

        const property = (await client.query(`
          INSERT INTO properties (
            landlord_id, name, street_address, type, catchment,
            description, operational_status, amenities, utilities, house_rules,
            contact_phone, contact_email, proposed_amenities, cover_photo_key
          ) VALUES (
            $1, $2, $3, $4::property_type, $5::university,
            $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $8::jsonb, $13
          ) RETURNING id, name, status::text, operational_status AS "operationalStatus"
        `, [
          input.landlordId,
          input.name,
          input.streetAddress,
          input.type,
          input.catchment,
          input.description ?? null,
          input.operationalStatus,
          JSON.stringify(input.amenities),
          JSON.stringify(input.utilities),
          JSON.stringify(input.houseRules),
          input.contactPhone ?? null,
          input.contactEmail || null,
          input.coverPhotoKey ?? null,
        ])).rows[0]!;

        await client.query(`
          INSERT INTO property_memberships (user_id, property_id, role, assigned_by)
          VALUES ($1, $2, 'landlord', $3)
          ON CONFLICT (user_id, property_id, role) WHERE revoked_at IS NULL DO NOTHING
        `, [input.landlordId, property.id, actor.userId]);

        if (input.imageKeys.length) {
          await client.query(`
            INSERT INTO property_media (property_id, storage_key, media_type, sort_order, uploaded_by)
            SELECT $1, item.storage_key, 'image', item.ordinality - 1, $2
            FROM unnest($3::text[]) WITH ORDINALITY AS item(storage_key, ordinality)
          `, [property.id, actor.userId, input.imageKeys]);
        }

        let unitCount = 0;
        if (input.units.length && input.semesterId) {
          unitCount = await this.insertUnits(client, property.id, input.semesterId, input.units);
        }
        await client.query('COMMIT');
        return { ...property, unitCount, imageCount: input.imageKeys.length };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        const pg = error as { code?: string };
        if (pg.code === '23505') throw new ConflictException('A conflicting property, listing, or unit already exists');
        throw error;
      }
    });
    await this.audit.record(actor, 'properties.create', 'property', result.id, {
      landlordId: input.landlordId,
      unitCount: result.unitCount,
      imageCount: result.imageCount,
    });
    return result;
  }

  detail(propertyId: string) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const property = (await client.query(`
        SELECT p.*, p.street_address AS "streetAddress", p.landlord_id AS "landlordId",
               p.operational_status AS "operationalStatus", p.house_rules AS "houseRules",
               p.contact_phone AS "contactPhone", p.contact_email AS "contactEmail",
               p.cover_photo_key AS "coverPhotoKey", u.name AS "landlordName", u.email AS "landlordEmail"
        FROM properties p JOIN users u ON u.id = p.landlord_id WHERE p.id = $1
      `, [propertyId])).rows[0];
      if (!property) throw new NotFoundException('Property not found');
      const media = await client.query(`
          SELECT id, storage_key AS "storageKey", media_type AS "mediaType", caption,
                 sort_order AS "sortOrder", created_at AS "createdAt"
          FROM property_media WHERE property_id = $1 ORDER BY sort_order, created_at
        `, [propertyId]);
      const listings = await client.query(`
          SELECT li.id, li.semester_id AS "semesterId", s.name AS semester,
                 li.status::text, li.created_at AS "createdAt"
          FROM listings li JOIN semesters s ON s.id = li.semester_id
          WHERE li.property_id = $1 ORDER BY s.starts_on DESC
        `, [propertyId]);
      const units = await client.query(`
          SELECT un.id, un.listing_id AS "listingId", un.label, un.capacity,
                 un.room_category::text AS "roomCategory", un.price_per_term_ugx AS "pricePerTermUgx",
                 un.operational_status AS "operationalStatus", un.building_name AS "buildingName",
                 un.floor_label AS "floorLabel", un.electricity_meter_type AS "electricityMeterType",
                 un.amenities, un.notes
          FROM units un JOIN listings li ON li.id = un.listing_id
          WHERE li.property_id = $1 ORDER BY un.building_name NULLS FIRST, un.floor_label NULLS FIRST, un.label
        `, [propertyId]);
      const memberships = await client.query(`
          SELECT pm.id, pm.user_id AS "userId", u.name, u.email, u.phone,
                 pm.role, pm.worker_type AS "workerType", pm.status,
                 pm.starts_at AS "startsAt", pm.ends_at AS "endsAt"
          FROM property_memberships pm JOIN users u ON u.id = pm.user_id
          WHERE pm.property_id = $1 AND pm.revoked_at IS NULL ORDER BY pm.role, u.name
        `, [propertyId]);
      return { property, media: media.rows, listings: listings.rows, units: units.rows, memberships: memberships.rows };
    });
  }

  async update(actor: RlsContext, propertyId: string, input: UpdateAdminPropertyInput) {
    const columnMap: Record<string, { column: string; cast?: string; json?: boolean }> = {
      landlordId: { column: 'landlord_id' },
      name: { column: 'name' },
      streetAddress: { column: 'street_address' },
      type: { column: 'type', cast: '::property_type' },
      catchment: { column: 'catchment', cast: '::university' },
      description: { column: 'description' },
      operationalStatus: { column: 'operational_status' },
      amenities: { column: 'amenities', cast: '::jsonb', json: true },
      utilities: { column: 'utilities', cast: '::jsonb', json: true },
      houseRules: { column: 'house_rules', cast: '::jsonb', json: true },
      contactPhone: { column: 'contact_phone' },
      contactEmail: { column: 'contact_email' },
      coverPhotoKey: { column: 'cover_photo_key' },
    };
    const values: unknown[] = [];
    const sets: string[] = [];
    for (const [key, config] of Object.entries(columnMap)) {
      const value = input[key as keyof UpdateAdminPropertyInput];
      if (value === undefined) continue;
      values.push(config.json ? JSON.stringify(value) : value === '' ? null : value);
      sets.push(`${config.column} = $${values.length + 1}${config.cast ?? ''}`);
    }
    if (!sets.length) throw new BadRequestException('No property fields were provided');
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query('BEGIN');
      try {
        const existing = (await client.query(
          'SELECT landlord_id AS "landlordId" FROM properties WHERE id = $1 FOR UPDATE',
          [propertyId],
        )).rows[0];
        if (!existing) throw new NotFoundException('Property not found');

        if (input.landlordId) {
          const landlord = (await client.query(`
            SELECT l.user_id FROM landlords l JOIN users u ON u.id = l.user_id
            WHERE l.user_id = $1 AND u.deleted_at IS NULL
          `, [input.landlordId])).rows[0];
          if (!landlord) throw new BadRequestException('The selected owner has no active landlord profile');
        }

        const row = (await client.query(`
          UPDATE properties SET ${sets.join(', ')} WHERE id = $1
          RETURNING id, name, operational_status AS "operationalStatus"
        `, [propertyId, ...values])).rows[0];

        if (input.landlordId && input.landlordId !== existing.landlordId) {
          await client.query(`
            UPDATE property_memberships
            SET revoked_at = now(), revoked_by = $3, status = 'revoked',
                revocation_reason = 'Property ownership transferred'
            WHERE user_id = $1 AND property_id = $2 AND role = 'landlord' AND revoked_at IS NULL
          `, [existing.landlordId, propertyId, actor.userId]);
          await client.query(`
            INSERT INTO property_memberships (user_id, property_id, role, assigned_by)
            VALUES ($1, $2, 'landlord', $3)
            ON CONFLICT (user_id, property_id, role) WHERE revoked_at IS NULL DO NOTHING
          `, [input.landlordId, propertyId, actor.userId]);
        }

        await client.query('COMMIT');
        return row;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
    await this.audit.record(actor, 'properties.update', 'property', propertyId, { fields: Object.keys(input) });
    return result;
  }

  async addUnits(actor: RlsContext, propertyId: string, input: AddAdminPropertyUnitsInput) {
    const count = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query('BEGIN');
      try {
        const exists = (await client.query('SELECT id FROM properties WHERE id = $1', [propertyId])).rows[0];
        if (!exists) throw new NotFoundException('Property not found');
        const inserted = await this.insertUnits(client, propertyId, input.semesterId, input.units);
        await client.query('COMMIT');
        return inserted;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
    await this.audit.record(actor, 'properties.units_add', 'property', propertyId, { count, semesterId: input.semesterId });
    return { propertyId, added: count };
  }

  async addMedia(actor: RlsContext, propertyId: string, input: AddAdminPropertyMediaInput) {
    const rows = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const exists = (await client.query('SELECT id FROM properties WHERE id = $1', [propertyId])).rows[0];
      if (!exists) throw new NotFoundException('Property not found');
      const inserted = [];
      for (const [index, item] of input.items.entries()) {
        const row = (await client.query(`
          INSERT INTO property_media (property_id, storage_key, media_type, caption, sort_order, uploaded_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, storage_key AS "storageKey", media_type AS "mediaType", caption, sort_order AS "sortOrder"
        `, [propertyId, item.storageKey, input.mediaType, item.caption ?? null, index, actor.userId])).rows[0];
        inserted.push(row);
      }
      return inserted;
    });
    await this.audit.record(actor, 'properties.media_add', 'property', propertyId, { count: rows.length, mediaType: input.mediaType });
    return { rows };
  }

  async removeMedia(actor: RlsContext, propertyId: string, mediaId: string) {
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const row = (await client.query(
        'DELETE FROM property_media WHERE id = $1 AND property_id = $2 RETURNING id, storage_key AS "storageKey"',
        [mediaId, propertyId],
      )).rows[0];
      if (!row) throw new NotFoundException('Property media not found');
      return row;
    });
    await this.audit.record(actor, 'properties.media_remove', 'property_media', mediaId, { propertyId });
    return result;
  }

  private async insertUnits(
    client: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
    propertyId: string,
    semesterId: string,
    units: AdminUnitInput[],
  ): Promise<number> {
    const semester = (await client.query(`
      SELECT s.id
      FROM semesters s
      JOIN properties p ON p.id = $2
      WHERE s.id = $1
        AND s.archived_at IS NULL
        AND (s.university IS NULL OR s.university = p.catchment)
    `, [semesterId, propertyId])).rows[0];
    if (!semester) {
      throw new BadRequestException('Select an active semester configured for this property university');
    }
    const listing = (await client.query(`
      INSERT INTO listings (property_id, semester_id, status)
      VALUES ($1, $2, 'draft')
      ON CONFLICT (property_id, semester_id) DO UPDATE SET property_id = EXCLUDED.property_id
      RETURNING id
    `, [propertyId, semesterId])).rows[0]!;
    for (const unit of units) {
      await client.query(`
        INSERT INTO units (
          listing_id, label, capacity, room_category, price_per_term_ugx,
          available_for_semester_id, operational_status, building_name, floor_label,
          electricity_meter_type, amenities, notes
        ) VALUES ($1, $2, $3, $4::room_category, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
      `, [
        listing.id,
        unit.label,
        unit.capacity,
        unit.roomCategory,
        unit.pricePerTermUgx,
        semesterId,
        unit.operationalStatus,
        unit.buildingName ?? null,
        unit.floorLabel ?? null,
        unit.electricityMeterType ?? null,
        JSON.stringify(unit.amenities),
        unit.notes ?? null,
      ]);
    }
    return units.length;
  }
}
