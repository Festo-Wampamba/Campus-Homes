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
          SELECT l.user_id, l.kyc_status AS "kycStatus" FROM landlords l JOIN users u ON u.id = l.user_id
          WHERE l.user_id = $1 AND u.deleted_at IS NULL
        `, [input.landlordId])).rows[0];
        if (!landlord) throw new BadRequestException('Select a user with an active landlord profile');

        // Mirrors ListingsService.submitProperty's own gate: the 'pending_kyc'
        // column default only makes sense for a property created before its
        // landlord was reviewed. Inserting it unconditionally here left
        // admin-created properties for an already-verified landlord stuck at
        // 'pending_kyc' forever, since decideKyc()'s flip only fires for
        // properties that already existed at the moment of approval.
        const status = landlord.kycStatus === 'verified' ? 'active' : 'pending_kyc';
        const property = (await client.query(`
          INSERT INTO properties (
            landlord_id, name, alternative_name, street_address, location_details,
            type, gender_arrangement, catchment, other_catchments, status,
            description, operational_status, amenities, utilities, house_rules,
            contact_phone, contact_email, proposed_amenities, cover_photo_key,
            furnishing_items, security_features, accessibility_features, photography_consent,
            self_contained_room_count, non_self_contained_room_count,
            transport_shuttle, advance_rent_required, booking_fee_percent,
            rent_period, rent_period_other, authority_role, authority_role_other,
            declared_info_accurate, declared_authority_over_property,
            declared_will_keep_updated, declared_authorizes_publish, declared_consent_to_processing
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6::property_type, $7, $8::university, $9::jsonb, $10::property_status,
            $11, $12, $13::jsonb, $14::jsonb, $15::jsonb,
            $16, $17, $13::jsonb, $18,
            $19::jsonb, $20::jsonb, $21::jsonb, $22,
            $23, $24,
            $25, $26, $27,
            $28, $29, $30, $31,
            $32, $33,
            $34, $35, $36
          ) RETURNING id, name, status::text, operational_status AS "operationalStatus"
        `, [
          input.landlordId,
          input.name,
          input.alternativeName ?? null,
          input.streetAddress,
          input.locationDetails ?? null,
          input.type,
          input.genderArrangement ?? null,
          input.catchment,
          JSON.stringify(input.otherCatchments),
          status,
          input.description ?? null,
          input.operationalStatus,
          JSON.stringify(input.amenities),
          JSON.stringify(input.utilities),
          JSON.stringify(input.houseRules),
          input.contactPhone ?? null,
          input.contactEmail || null,
          input.coverPhotoKey ?? null,
          JSON.stringify(input.furnishingItems),
          JSON.stringify(input.securityFeatures),
          JSON.stringify(input.accessibilityFeatures),
          input.photographyConsent,
          input.selfContainedRoomCount ?? null,
          input.nonSelfContainedRoomCount ?? null,
          input.transportShuttle,
          input.advanceRentRequired,
          input.bookingFeePercent ?? null,
          input.rentPeriod ?? null,
          input.rentPeriodOther ?? null,
          input.authorityRole ?? null,
          input.authorityRoleOther ?? null,
          input.declaredInfoAccurate,
          input.declaredAuthorityOverProperty,
          input.declaredWillKeepUpdated,
          input.declaredAuthorizesPublish,
          input.declaredConsentToProcessing,
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
               p.cover_photo_key AS "coverPhotoKey",
               p.alternative_name AS "alternativeName", p.location_details AS "locationDetails",
               p.gender_arrangement AS "genderArrangement", p.other_catchments AS "otherCatchments",
               p.authority_role AS "authorityRole", p.authority_role_other AS "authorityRoleOther",
               p.transport_shuttle AS "transportShuttle", p.advance_rent_required AS "advanceRentRequired",
               p.booking_fee_percent AS "bookingFeePercent", p.rent_period AS "rentPeriod",
               p.rent_period_other AS "rentPeriodOther", p.furnishing_items AS "furnishingItems",
               p.security_features AS "securityFeatures", p.accessibility_features AS "accessibilityFeatures",
               p.photography_consent AS "photographyConsent",
               p.self_contained_room_count AS "selfContainedRoomCount",
               p.non_self_contained_room_count AS "nonSelfContainedRoomCount",
               p.declared_info_accurate AS "declaredInfoAccurate",
               p.declared_authority_over_property AS "declaredAuthorityOverProperty",
               p.declared_will_keep_updated AS "declaredWillKeepUpdated",
               p.declared_authorizes_publish AS "declaredAuthorizesPublish",
               p.declared_consent_to_processing AS "declaredConsentToProcessing",
               u.name AS "landlordName", u.email AS "landlordEmail"
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
                 un.deposit_ugx AS "depositUgx",
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
      alternativeName: { column: 'alternative_name' },
      streetAddress: { column: 'street_address' },
      locationDetails: { column: 'location_details' },
      type: { column: 'type', cast: '::property_type' },
      genderArrangement: { column: 'gender_arrangement' },
      catchment: { column: 'catchment', cast: '::university' },
      otherCatchments: { column: 'other_catchments', cast: '::jsonb', json: true },
      description: { column: 'description' },
      operationalStatus: { column: 'operational_status' },
      amenities: { column: 'amenities', cast: '::jsonb', json: true },
      utilities: { column: 'utilities', cast: '::jsonb', json: true },
      furnishingItems: { column: 'furnishing_items', cast: '::jsonb', json: true },
      securityFeatures: { column: 'security_features', cast: '::jsonb', json: true },
      accessibilityFeatures: { column: 'accessibility_features', cast: '::jsonb', json: true },
      photographyConsent: { column: 'photography_consent' },
      selfContainedRoomCount: { column: 'self_contained_room_count' },
      nonSelfContainedRoomCount: { column: 'non_self_contained_room_count' },
      transportShuttle: { column: 'transport_shuttle' },
      advanceRentRequired: { column: 'advance_rent_required' },
      bookingFeePercent: { column: 'booking_fee_percent' },
      rentPeriod: { column: 'rent_period' },
      rentPeriodOther: { column: 'rent_period_other' },
      authorityRole: { column: 'authority_role' },
      authorityRoleOther: { column: 'authority_role_other' },
      declaredInfoAccurate: { column: 'declared_info_accurate' },
      declaredAuthorityOverProperty: { column: 'declared_authority_over_property' },
      declaredWillKeepUpdated: { column: 'declared_will_keep_updated' },
      declaredAuthorizesPublish: { column: 'declared_authorizes_publish' },
      declaredConsentToProcessing: { column: 'declared_consent_to_processing' },
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
          listing_id, label, capacity, room_category, price_per_term_ugx, deposit_ugx,
          available_for_semester_id, operational_status, building_name, floor_label,
          electricity_meter_type, amenities, notes
        ) VALUES ($1, $2, $3, $4::room_category, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
      `, [
        listing.id,
        unit.label,
        unit.capacity,
        unit.roomCategory,
        unit.pricePerTermUgx,
        unit.depositUgx ?? null,
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
