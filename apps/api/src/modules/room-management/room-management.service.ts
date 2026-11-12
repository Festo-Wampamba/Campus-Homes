import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';

import { normalizeRoomTypeName, roomTypeImportLabels } from '@campushomes/shared';
import type {
  ProposedRoomCategory,
  BedBlockInput,
  BatchRoomDeleteInput,
  BatchRoomUpdateInput,
  BulkRoomInput,
  RoomTypeInput,
  RoomUnitInput,
  UnitBlockInput,
} from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import { RlsDb } from '../../db/db.module';
import { assertStaffScope } from '../auth/staff-scope';
import { AuditService } from '../ops/audit.service';
import { roomTypeTitle } from '../ops/ops.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isOwnedStorageKey } from '../uploads/storage-key';
import { loadEnv } from '../../config/env';
import { sendRoomChangeEmail } from './room-change-email';
import { recordOperationsNotice, type OperationChange } from './operations-notice';
import { roomImportTemplate } from './room-import';

type JsonRecord = Record<string, unknown>;

// Beds per room are implied for these types; other types use the landlord's own count.
const FIXED_BEDS_PER_ROOM: Partial<Record<string, number>> = { single: 1, double: 2, triple: 3, quad: 4 };

interface ChangeSetRow {
  id: string;
  property_id: string;
  semester_id: string;
  status: string;
  submitted_at: Date | null;
  reviewer_notes: string | null;
  rejection_reason: string | null;
}

interface RoomTypeVersionRow {
  id: string;
  room_type_id: string;
  change_set_id: string | null;
  version_number: number;
  title: string;
  category: string;
  bathroom_type: string;
  capacity: number;
  size_sqm: number | null;
  description: string | null;
  amenities: string[];
  semester_id: string;
  price_per_term_ugx: number;
  deposit_ugx: number | null;
  status: string;
  rejection_reason: string | null;
  reviewer_notes: string | null;
  submitted_at: Date | null;
  reviewed_at: Date | null;
}

interface RoomTypePhotoRow {
  id: string; room_type_version_id: string; storage_key: string; sort_order: number;
  is_primary: boolean; uploaded_by: string; created_at: Date;
}
interface RoomBedRow {
  id: string; unit_id: string; label: string; blocked: boolean; blocked_reason: string | null; reservation_id: string | null;
  status: string | null; reserved_expires_at: Date | null; booked_at: Date | null; student_name: string | null; student_phone: string | null;
}
interface RoomBlockRow {
  id: string; unit_id: string; reason: string; starts_at: Date; ends_at: Date | null; notes: string | null;
  created_by: string; cleared_at: Date | null; created_at: Date;
}

// Changes a landlord sent to Ops before the property was established (see
// appliesAtOnce) need no review afterwards, and must not block new edits.
const WAITING_FOR_REVIEW = ['pending_review', 'visit_required'];

@Injectable()
export class RoomManagementService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async overview(ctx: RlsContext, propertyId: string, semesterId: string) {
    return this.rlsDb.run({ ...ctx, role: 'service_role' }, async (db, client) => {
      await this.assertPropertyOwner(client, propertyId, ctx.userId);
      const property = await db.query.properties.findFirst({
        where: (table, { eq }) => eq(table.id, propertyId),
      });
      if (!property) throw new NotFoundException('Property not found');

      const ownedProperties = await db.query.properties.findMany({
        where: (table, { eq }) => eq(table.landlordId, ctx.userId),
        orderBy: (table, { asc }) => [asc(table.name)],
      });
      const semesters = await db.query.semesters.findMany({
        where: (table, { isNull }) => isNull(table.archivedAt),
        orderBy: (table, { asc }) => [asc(table.startsOn)],
      });
      const currentSemester = semesters.find((semester) => semester.id === semesterId);
      if (!currentSemester) throw new BadRequestException('Selected semester is not available');

      // Bridge any physical rooms that exist without a room-type link (e.g.
      // rooms created outside this module, or imported/seeded inventory) so
      // they appear here and the category dropdowns are populated.
      await this.ensureCategoryRoomTypes(client, propertyId, semesterId, ctx.userId);

      await this.releaseWaitingChanges(client, propertyId, ctx.userId);
      const changeSet = await this.openChangeSet(client, propertyId, semesterId);
      const roomTypes = await this.loadRoomTypes(client, propertyId, changeSet?.id ?? null);
      const rooms = await this.loadRooms(client, propertyId, changeSet?.id ?? null);

      const summary = {
        totalRooms: rooms.length,
        totalBeds: rooms.reduce((sum, room) => sum + room.totalBeds, 0),
        availableBeds: rooms.reduce((sum, room) =>
          room.derivedStatus === 'blocked'
            ? sum
            : sum + room.beds.filter((bed) => !bed.blocked && bed.status === 'available').length,
        0),
        partiallyOccupiedRooms: rooms.filter((room) => room.derivedStatus === 'partially_occupied').length,
        fullyOccupiedRooms: rooms.filter((room) => room.derivedStatus === 'fully_occupied').length,
        blockedRooms: rooms.filter((room) => room.derivedStatus === 'blocked').length,
      };

      return {
        property,
        properties: ownedProperties,
        currentSemester: { id: currentSemester.id, name: currentSemester.name },
        semesters: semesters.map((semester) => ({ id: semester.id, name: semester.name })),
        summary,
        changeSet: changeSet ? await this.mapChangeSet(client, changeSet) : null,
        appliesAtOnce: await this.appliesAtOnce(client, propertyId),
        roomTypes,
        rooms,
      };
    });
  }

  async createRoomType(ctx: RlsContext, propertyId: string, input: RoomTypeInput) {
    const roomTypeId = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await this.assertPropertyOwner(client, propertyId, ctx.userId);
      await this.assertPhotoKeys(client, ctx.userId, input.photos);
      await this.assertDistinctRoomTypeDescription(client, propertyId, input);
      const changeSet = await this.getOrCreateDraft(client, propertyId, input.semesterId, ctx.userId);
      const type = await client.query<{ id: string }>(
        `INSERT INTO room_types(property_id, created_by) VALUES ($1, $2) RETURNING id`,
        [propertyId, ctx.userId],
      );
      const id = type.rows[0]!.id;
      const versionId = await this.insertVersion(client, id, changeSet.id, 1, ctx.userId, input);
      await this.replacePhotos(client, versionId, ctx.userId, input.photos);
      await this.applyIfEstablished(client, propertyId, ctx.userId);
      return id;
    });
    await this.audit.record(ctx, 'room_type.draft_create', 'room_type', roomTypeId, { propertyId });
    return this.roomType(ctx, roomTypeId);
  }

  async updateRoomType(ctx: RlsContext, roomTypeId: string, input: RoomTypeInput) {
    await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const type = await this.assertRoomTypeOwner(client, roomTypeId, ctx.userId);
      await this.assertPhotoKeys(client, ctx.userId, input.photos, roomTypeId);
      await this.assertDistinctRoomTypeDescription(client, type.property_id, input, roomTypeId);
      const changeSet = await this.getOrCreateDraft(client, type.property_id, input.semesterId, ctx.userId);
      const existing = await client.query<{ id: string; version_number: number }>(
        `SELECT id, version_number FROM room_type_versions
         WHERE room_type_id = $1 AND change_set_id = $2 AND status IN ('draft','rejected')
         ORDER BY version_number DESC LIMIT 1 FOR UPDATE`,
        [roomTypeId, changeSet.id],
      );
      let versionId: string;
      if (existing.rows[0]) {
        versionId = existing.rows[0].id;
        await client.query(
          `UPDATE room_type_versions SET
             title=$2, category=$3, bathroom_type=$4, capacity=$5, size_sqm=$6,
             description=$7, amenities=$8::jsonb, semester_id=$9,
             price_per_term_ugx=$10, deposit_ugx=$11, status='draft',
             rejection_reason=NULL, reviewer_notes=NULL, reviewed_at=NULL
           WHERE id=$1`,
          [versionId, input.title, input.category, input.bathroomType, input.capacity,
            input.sizeSqm ?? null, input.description ?? null, JSON.stringify(input.amenities),
            input.semesterId, input.pricePerTermUgx, input.depositUgx ?? null],
        );
      } else {
        const next = await client.query<{ value: number }>(
          `SELECT COALESCE(max(version_number), 0) + 1 AS value FROM room_type_versions WHERE room_type_id=$1`,
          [roomTypeId],
        );
        versionId = await this.insertVersion(client, roomTypeId, changeSet.id, Number(next.rows[0]!.value), ctx.userId, input);
      }
      await this.replacePhotos(client, versionId, ctx.userId, input.photos);
      await this.applyIfEstablished(client, type.property_id, ctx.userId);
    });
    await this.audit.record(ctx, 'room_type.draft_update', 'room_type', roomTypeId, {});
    return this.roomType(ctx, roomTypeId);
  }

  async roomType(ctx: RlsContext, roomTypeId: string) {
    return this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const type = await this.assertRoomTypeOwner(client, roomTypeId, ctx.userId);
      const changeSet = await this.openChangeSet(client, type.property_id);
      const rows = await this.loadRoomTypes(client, type.property_id, changeSet?.id ?? null);
      const result = rows.find((row) => row.id === roomTypeId);
      if (!result) throw new NotFoundException('Room type not found');
      return result;
    });
  }

  async createRoom(ctx: RlsContext, propertyId: string, input: RoomUnitInput) {
    const changeId = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await this.assertPropertyOwner(client, propertyId, ctx.userId);
      const type = await this.assertRoomTypeOwner(client, input.roomTypeId, ctx.userId, propertyId);
      const semesterId = await this.roomTypeSemester(client, input.roomTypeId);
      const changeSet = await this.getOrCreateDraft(client, propertyId, semesterId, ctx.userId);
      await this.assertRoomCodeAvailable(client, propertyId, input.roomCode, input.buildingName ?? null);
      const capacity = await this.roomTypeCapacity(client, input.roomTypeId);
      const created = await client.query<{ id: string }>(
        `INSERT INTO room_unit_changes(change_set_id, action, room_type_id, proposed_data, created_by)
         VALUES ($1, 'create', $2, $3::jsonb, $4) RETURNING id`,
        [changeSet.id, type.id, JSON.stringify({ ...input, capacity }), ctx.userId],
      );
      const createdId = created.rows[0]!.id;
      const applied = await this.applyIfEstablished(client, propertyId, ctx.userId);
      return applied?.get(createdId) ?? createdId;
    });
    await this.audit.record(ctx, 'room.draft_create', 'room_unit_change', changeId, { propertyId });
    return this.pendingRoom(ctx, propertyId, changeId);
  }

  async bulkCreateRooms(ctx: RlsContext, propertyId: string, input: BulkRoomInput) {
    const changeIds = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await this.assertPropertyOwner(client, propertyId, ctx.userId);
      await this.assertRoomTypeOwner(client, input.roomTypeId, ctx.userId, propertyId);
      const normalized = input.roomCodes.map((code) => code.trim());
      if (new Set(normalized.map((code) => code.toLocaleLowerCase())).size !== normalized.length) {
        throw new ConflictException('The batch contains duplicate room codes');
      }
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM room_unit_changes WHERE idempotency_key LIKE $1 ORDER BY created_at`,
        [`${input.idempotencyKey}:%`],
      );
      if (existing.rows.length) return existing.rows.map((row) => row.id);

      const semesterId = await this.roomTypeSemester(client, input.roomTypeId);
      const capacity = await this.roomTypeCapacity(client, input.roomTypeId);
      const changeSet = await this.getOrCreateDraft(client, propertyId, semesterId, ctx.userId);
      const ids: string[] = [];
      for (const [index, roomCode] of normalized.entries()) {
        await this.assertRoomCodeAvailable(client, propertyId, roomCode, input.buildingName ?? null);
        const created = await client.query<{ id: string }>(
          `INSERT INTO room_unit_changes(change_set_id, action, room_type_id, proposed_data, idempotency_key, created_by)
           VALUES ($1, 'create', $2, $3::jsonb, $4, $5) RETURNING id`,
          [changeSet.id, input.roomTypeId, JSON.stringify({ roomCode, roomTypeId: input.roomTypeId,
            buildingName: input.buildingName ?? null, floorLabel: input.floorLabel ?? null, capacity }),
            `${input.idempotencyKey}:${index}`, ctx.userId],
        );
        ids.push(created.rows[0]!.id);
      }
      const applied = await this.applyIfEstablished(client, propertyId, ctx.userId);
      return ids.map((id) => applied?.get(id) ?? id);
    });
    await this.audit.record(ctx, 'room.bulk_draft_create', 'property', propertyId, { count: changeIds.length });
    const overview = await this.overviewForProperty(ctx, propertyId);
    // A replayed batch on a managed property returns change ids of rooms
    // already applied, so match on the codes too.
    const codes = new Set(input.roomCodes.map((code) => code.trim().toLocaleLowerCase()));
    return overview.rooms.filter((room) =>
      changeIds.includes(room.id)
      || (codes.has(room.roomCode.toLocaleLowerCase()) && (room.buildingName ?? null) === (input.buildingName ?? null)));
  }

  async updateRoom(ctx: RlsContext, roomOrChangeId: string, input: RoomUnitInput) {
    const { propertyId, roomId } = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const propertyId = await this.stageRoomUpdate(client, ctx, roomOrChangeId, input);
      const applied = await this.applyIfEstablished(client, propertyId, ctx.userId);
      return { propertyId, roomId: applied?.get(roomOrChangeId) ?? roomOrChangeId };
    });
    await this.audit.record(ctx, 'room.draft_update', 'unit', roomOrChangeId, {});
    return this.pendingRoom(ctx, propertyId, roomId);
  }

  /** Many room edits in one draft change set, all or nothing. */
  async batchUpdateRooms(ctx: RlsContext, propertyId: string, input: BatchRoomUpdateInput) {
    const roomIds = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await this.assertPropertyOwner(client, propertyId, ctx.userId);
      for (const { roomId, ...room } of input.rooms) {
        const roomPropertyId = await this.stageRoomUpdate(client, ctx, roomId, room);
        if (roomPropertyId !== propertyId) throw new BadRequestException('Every room must belong to this property');
      }
      const applied = await this.applyIfEstablished(client, propertyId, ctx.userId);
      return input.rooms.map((room) => applied?.get(room.roomId) ?? room.roomId);
    });
    await this.audit.record(ctx, 'room.batch_draft_update', 'property', propertyId, { count: input.rooms.length });
    const ids = new Set(roomIds);
    const overview = await this.overviewForProperty(ctx, propertyId);
    return overview.rooms.filter((room: { id: string }) => ids.has(room.id));
  }

  /** Stages one room edit inside the caller's transaction; returns its property. */
  private async stageRoomUpdate(client: PoolClient, ctx: RlsContext, roomOrChangeId: string, input: RoomUnitInput) {
      const pending = await client.query<{ id: string; property_id: string; change_set_id: string }>(
        `SELECT c.id, cs.property_id, c.change_set_id FROM room_unit_changes c
         JOIN room_inventory_change_sets cs ON cs.id=c.change_set_id
         JOIN properties p ON p.id=cs.property_id
         WHERE c.id=$1 AND p.landlord_id=$2 AND cs.status IN ('draft','rejected')`,
        [roomOrChangeId, ctx.userId],
      );
      if (pending.rows[0]) {
        await this.assertRoomTypeOwner(client, input.roomTypeId, ctx.userId, pending.rows[0].property_id);
        await this.assertRoomCodeAvailable(client, pending.rows[0].property_id, input.roomCode, input.buildingName ?? null, roomOrChangeId);
        const capacity = await this.roomTypeCapacity(client, input.roomTypeId);
        await client.query(`UPDATE room_unit_changes SET room_type_id=$2, proposed_data=$3::jsonb WHERE id=$1`,
          [roomOrChangeId, input.roomTypeId, JSON.stringify({ ...input, capacity })]);
        return pending.rows[0].property_id;
      }

      const unit = await this.assertUnitOwner(client, roomOrChangeId, ctx.userId);
      await this.assertRoomTypeOwner(client, input.roomTypeId, ctx.userId, unit.property_id);
      await this.assertRoomCodeAvailable(client, unit.property_id, input.roomCode, input.buildingName ?? null, roomOrChangeId);
      const semesterId = await this.roomTypeSemester(client, input.roomTypeId);
      const changeSet = await this.getOrCreateDraft(client, unit.property_id, semesterId, ctx.userId);
      const capacity = await this.roomTypeCapacity(client, input.roomTypeId);
      await client.query(
        `INSERT INTO room_unit_changes(change_set_id, action, unit_id, room_type_id, proposed_data, created_by)
         VALUES ($1,'update',$2,$3,$4::jsonb,$5)`,
        [changeSet.id, roomOrChangeId, input.roomTypeId, JSON.stringify({ ...input, capacity }), ctx.userId],
      );
      return unit.property_id;
  }

  /** Removing inventory never needs a new inspection. Archive instead of
   * hard-deleting so past reservations, payments and photos retain their links. */
  async deleteRooms(ctx: RlsContext, propertyId: string, input: BatchRoomDeleteInput) {
    const result = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await this.assertPropertyOwner(client, propertyId, ctx.userId);
      await client.query('SELECT id FROM properties WHERE id=$1 FOR UPDATE', [propertyId]);
      let discarded = 0;
      const removed: string[] = [];
      for (const roomId of input.roomIds) {
        const draft = await client.query(
          `DELETE FROM room_unit_changes c USING room_inventory_change_sets cs
           WHERE c.id=$1 AND c.action='create' AND cs.id=c.change_set_id
             AND cs.property_id=$2 AND cs.status IN ('draft','rejected','pending_review','visit_required')`, [roomId, propertyId]);
        if (draft.rowCount) { discarded += 1; continue; }
        const unit = await this.assertUnitOwner(client, roomId, ctx.userId);
        if (unit.property_id !== propertyId) throw new BadRequestException('Every room must belong to this property');
        await this.archiveUnusedRoom(client, unit.id);
        removed.push(unit.label);
      }
      await this.cancelEmptyInventoryRequests(client, propertyId);
      await recordOperationsNotice(client, propertyId, 'room_changes.applied',
        `${removed.length + discarded} rooms removed by the landlord. Applied immediately; no approval is needed.`,
        { changes: removed.map((label) => ({ label: `${label} · Room`, before: 'Active', after: 'Removed' })) });
      return { discarded, staged: 0, archived: removed.length, applied: true };
    });
    await this.audit.record(ctx, 'room.delete', 'property', propertyId, { ...result, roomIds: input.roomIds });
    return result;
  }

  async saveOpsSpecifications(ctx: RlsContext, propertyId: string, inputs: RoomTypeInput[]) {
    await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await assertStaffScope(client, ctx, propertyId);
      await client.query('SELECT id FROM properties WHERE id=$1 FOR UPDATE', [propertyId]);
      for (const input of inputs) {
        const semester = await client.query(`SELECT 1 FROM semesters s JOIN properties p ON p.id=$2 WHERE s.id=$1 AND (s.university IS NULL OR s.university=p.catchment)`,[input.semesterId,propertyId]);
        if (!semester.rows.length) throw new BadRequestException('Semester does not match this property');
        const existing = await client.query(`SELECT 1 FROM room_types t JOIN room_type_versions v ON v.id=t.current_version_id WHERE t.property_id=$1 AND t.archived_at IS NULL AND lower(v.title)=lower($2) AND v.capacity=$3 AND v.bathroom_type=$4 AND v.price_per_term_ugx=$5`,[propertyId,input.title,input.capacity,input.bathroomType,input.pricePerTermUgx]);
        if(existing.rows.length) continue;
        const type = await client.query<{id:string}>(`INSERT INTO room_types(property_id,created_by) VALUES($1,$2) RETURNING id`,[propertyId,ctx.userId]);
        const version = await client.query<{id:string}>(`INSERT INTO room_type_versions(room_type_id,version_number,title,category,bathroom_type,capacity,size_sqm,description,amenities,semester_id,price_per_term_ugx,deposit_ugx,status,reviewed_by,reviewed_at)
          VALUES($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'approved',$12,now()) RETURNING id`,[type.rows[0]!.id,input.title,input.category,input.bathroomType,input.capacity,input.sizeSqm??null,input.description??null,JSON.stringify(input.amenities),input.semesterId,input.pricePerTermUgx,input.depositUgx??null,ctx.userId]);
        await client.query('UPDATE room_types SET current_version_id=$2 WHERE id=$1',[type.rows[0]!.id,version.rows[0]!.id]);
      }
    });
    await this.audit.record(ctx,'room_type.ops_specifications','property',propertyId,{count:inputs.length});
    return {saved:true};
  }

  async deleteRoomType(ctx: RlsContext, roomTypeId: string) {
    const result = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const type = await this.assertRoomTypeOwner(client, roomTypeId, ctx.userId);
      await client.query('SELECT id FROM properties WHERE id=$1 FOR UPDATE', [type.property_id]);
      const units = await client.query<{ id: string; label: string }>(
        `SELECT id,label FROM units WHERE room_type_id=$1 AND archived_at IS NULL ORDER BY id FOR UPDATE`, [roomTypeId]);
      // All or nothing: one booked room rolls back the entire type removal.
      for (const unit of units.rows) await this.archiveUnusedRoom(client, unit.id);
      const title = await client.query<{ title: string }>(
        `SELECT title FROM room_type_versions WHERE room_type_id=$1 ORDER BY version_number DESC LIMIT 1`, [roomTypeId]);
      await client.query(
        `DELETE FROM room_unit_changes c USING room_inventory_change_sets cs
         WHERE c.room_type_id=$1 AND c.change_set_id=cs.id AND cs.status IN ('draft','rejected','pending_review','visit_required')`, [roomTypeId]);
      // Keep the specifications/history, but withdraw them from open queues.
      await client.query(
        `UPDATE room_type_versions v SET change_set_id=NULL
         FROM room_inventory_change_sets cs WHERE v.room_type_id=$1 AND cs.id=v.change_set_id
           AND cs.status IN ('draft','rejected','pending_review','visit_required')`, [roomTypeId]);
      await client.query('UPDATE room_types SET archived_at=now(),updated_at=now() WHERE id=$1', [roomTypeId]);
      await this.cancelEmptyInventoryRequests(client, type.property_id);
      await recordOperationsNotice(client, type.property_id, 'room_changes.applied',
        `The landlord removed room type ${title.rows[0]?.title ?? 'Room type'} and ${units.rows.length} unused rooms. No approval is needed.`,
        { changes: [{ label: 'Room type', before: title.rows[0]?.title ?? 'Room type', after: 'Removed' },
          ...units.rows.map((unit) => ({ label: `${unit.label} · Room`, before: 'Active', after: 'Removed' }))] });
      return { propertyId: type.property_id, archivedRooms: units.rows.length, applied: true };
    });
    await this.audit.record(ctx, 'room_type.delete', 'room_type', roomTypeId, result);
    return result;
  }

  private async archiveUnusedRoom(client: PoolClient, unitId: string) {
    await client.query('SELECT id FROM units WHERE id=$1 FOR UPDATE', [unitId]);
    // Reservation allocation locks beds too. Hold them through the archive so
    // a new hold cannot slip between the reservation check and this write.
    await client.query('SELECT id FROM beds WHERE unit_id=$1 ORDER BY id FOR UPDATE', [unitId]);
    const live = await client.query(
      `SELECT 1 FROM reservations r JOIN beds b ON b.id=r.bed_id
       WHERE b.unit_id=$1 AND r.status IN ('reserved','booked','occupied') LIMIT 1`, [unitId]);
    if (live.rows.length) throw new ConflictException('This room has an active reservation or tenant. Move or cancel the booking before deleting the room or its type.');
    await client.query(
      `DELETE FROM room_unit_changes c USING room_inventory_change_sets cs
       WHERE c.unit_id=$1 AND c.change_set_id=cs.id AND cs.status IN ('draft','rejected','pending_review','visit_required')`, [unitId]);
    await client.query(`UPDATE units SET archived_at=now(),operational_status='blocked' WHERE id=$1`, [unitId]);
  }

  private async cancelEmptyInventoryRequests(client: PoolClient, propertyId: string) {
    await client.query(
      `UPDATE room_inventory_change_sets cs SET status='cancelled',updated_at=now()
       WHERE cs.property_id=$1 AND cs.status IN ('draft','rejected','pending_review','visit_required')
         AND NOT EXISTS(SELECT 1 FROM room_unit_changes c WHERE c.change_set_id=cs.id)
         AND NOT EXISTS(SELECT 1 FROM room_type_versions v WHERE v.change_set_id=cs.id)`, [propertyId]);
  }

  async blockRoom(ctx: RlsContext, unitId: string, input: UnitBlockInput) {
    const block = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const unit = await this.assertUnitOwner(client, unitId, ctx.userId);
      const startsAt = input.startImmediately ? new Date() : new Date(input.startsAt);
      const endsAt = input.endsAt ? new Date(input.endsAt) : null;
      if (!Number.isFinite(startsAt.getTime()) || (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt || endsAt.getTime() <= Date.now()))) {
        throw new BadRequestException('The end time must be in the future and after the start time. Leave it blank to block until manually cleared.');
      }
      try {
        const inserted = await client.query<{
          id: string; unit_id: string; reason: string; starts_at: Date; ends_at: Date | null;
          notes: string | null; created_by: string; cleared_at: Date | null; created_at: Date;
        }>(
          `INSERT INTO unit_blocks(unit_id, reason, starts_at, ends_at, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [unitId, input.reason, startsAt.toISOString(), endsAt?.toISOString() ?? null, input.notes ?? null, ctx.userId],
        );
        await this.noticeRoomOperation(client, unit, 'Room block added', [
          { label: `${unit.label} · Block`, before: 'No block in this period', after: `${input.reason}: ${startsAt.toISOString()} to ${endsAt?.toISOString() ?? 'until cleared'}` },
        ]);
        return inserted.rows[0]!;
      } catch (error) {
        if ((error as { code?: string }).code === '23P01') {
          throw new ConflictException('This room already has a block during these dates. Clear its existing block or choose different dates.');
        }
        throw error;
      }
    });
    await this.audit.record(ctx, 'room.block', 'unit', unitId, { reason: input.reason, startsAt: block.starts_at.toISOString(), endsAt: block.ends_at?.toISOString() ?? null });
    const room = await this.roomAfterBlock(ctx, unitId);
    return { ...this.mapBlock(block), room };
  }

  async clearBlock(ctx: RlsContext, unitId: string, blockId: string) {
    await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const unit = await this.assertUnitOwner(client, unitId, ctx.userId);
      const result = await client.query(
        `UPDATE unit_blocks SET cleared_at=now(), cleared_by=$3
         WHERE id=$1 AND unit_id=$2 AND cleared_at IS NULL RETURNING id`,
        [blockId, unitId, ctx.userId],
      );
      if (!result.rows.length) throw new NotFoundException('Active room block not found');
      await this.noticeRoomOperation(client, unit, 'Room block cleared', [{ label: `${unit.label} · Block`, before: 'Blocked', after: 'Cleared' }]);
    });
    await this.audit.record(ctx, 'room.unblock', 'unit', unitId, { blockId });
    return { cleared: true, room: await this.roomAfterBlock(ctx, unitId) };
  }

  private async noticeRoomOperation(client: PoolClient, unit: { property_id: string }, message: string, changes: OperationChange[]) {
    const listed = await client.query(`SELECT 1 FROM properties WHERE id=$1 AND listing_intent='list'`, [unit.property_id]);
    if (listed.rows.length) await recordOperationsNotice(client, unit.property_id, 'room_changes.applied',
      `${message}. Saved immediately; no new approval is needed.`, { changes });
  }

  private async roomAfterBlock(ctx: RlsContext, unitId: string) {
    const propertyId = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => (await this.assertUnitOwner(client, unitId, ctx.userId)).property_id);
    return this.pendingRoom(ctx, propertyId, unitId);
  }

  async blockBed(ctx: RlsContext, unitId: string, bedId: string, input: BedBlockInput) {
    const result = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const unit = await this.assertUnitOwner(client, unitId, ctx.userId);
      const live = await client.query(
        `SELECT 1 FROM reservations WHERE bed_id=$1 AND status IN ('reserved','booked','occupied') LIMIT 1`, [bedId],
      );
      if (input.blocked && live.rows.length) throw new ConflictException('An occupied or reserved bed cannot be blocked');
      const updated = await client.query(
        `UPDATE beds SET blocked=$3, blocked_reason=$4 WHERE id=$1 AND unit_id=$2 AND retired_at IS NULL RETURNING id`,
        [bedId, unitId, input.blocked, input.blocked ? input.reason ?? 'Blocked by landlord' : null],
      );
      if (!updated.rows.length) throw new NotFoundException('Bedspace not found');
      const bed = await client.query<{ label: string }>('SELECT label FROM beds WHERE id=$1', [bedId]);
      await this.noticeRoomOperation(client, unit, input.blocked ? 'Bed blocked' : 'Bed unblocked', [
        { label: `${unit.label} · ${bed.rows[0]!.label}`, before: input.blocked ? 'Unblocked' : 'Blocked',
          after: input.blocked ? `Blocked: ${input.reason ?? 'Blocked by landlord'}` : 'Unblocked' },
      ]);
      return { blocked: input.blocked };
    });
    await this.audit.record(ctx, input.blocked ? 'bed.block' : 'bed.unblock', 'bed', bedId, { unitId });
    return result;
  }

  async submitChangeSet(ctx: RlsContext, changeSetId: string, notes?: string | null) {
    const result = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const row = await this.assertChangeSetOwner(client, changeSetId, ctx.userId, true);
      const counts = await this.changeCounts(client, changeSetId);
      if (counts.physicalRoomChangesCount + counts.roomTypeChangesCount === 0) {
        throw new BadRequestException('There are no changes to submit');
      }
      // Changes staged before the property was established (or sent back
      // by Ops) need no second review now: apply them.
      if (await this.appliesAtOnce(client, row.property_id)) {
        await client.query(`UPDATE room_inventory_change_sets SET status='draft', updated_at=now() WHERE id=$1`, [changeSetId]);
        await this.applyIfEstablished(client, row.property_id, ctx.userId);
        const applied = await client.query<ChangeSetRow>(`SELECT * FROM room_inventory_change_sets WHERE id=$1`, [changeSetId]);
        return { row: applied.rows[0]!, counts, propertyId: row.property_id };
      }
      // New rooms or capacity changes on a listed property need a site visit
      // before approval. A manage-only property (0076) is never shown to
      // students, so Ops still reviews it but never visits (Festo, 2026-10-26).
      const requiresVisit = await client.query(
        `SELECT 1 FROM room_unit_changes c JOIN properties p ON p.id = $2
         WHERE c.change_set_id=$1 AND c.action IN ('create','capacity_change') AND p.listing_intent = 'list' LIMIT 1`,
        [changeSetId, row.property_id],
      );
      const status = requiresVisit.rows.length ? 'visit_required' : 'pending_review';
      const updated = await client.query<ChangeSetRow>(
        `UPDATE room_inventory_change_sets SET status=$2, submitted_at=now(), submission_notes=$3,
           rejection_reason=NULL, reviewer_notes=NULL, updated_at=now()
         WHERE id=$1 RETURNING *`, [changeSetId, status, notes ?? null],
      );
      await client.query(
        `UPDATE room_type_versions SET status=$2, submitted_at=now(), rejection_reason=NULL, reviewer_notes=NULL
         WHERE change_set_id=$1 AND status IN ('draft','rejected')`, [changeSetId, status],
      );
      const reviewers = await recordOperationsNotice(client, row.property_id, 'room_changes.submitted',
        status === 'visit_required'
          ? 'Room changes require a physical inspection. The Ops lead can visit or assign an inspector.'
          : 'Room changes are waiting for Operations review.', { changeSetId });
      return { row: updated.rows[0]!, counts, propertyId: row.property_id, reviewers };
    });
    await this.audit.record(ctx, 'room_change_set.submit', 'room_inventory_change_set', changeSetId, result.counts);
    if (result.row.status === 'approved') return { ...this.mapChangeSetRow(result.row), ...result.counts };
    for (const portal of ['ops', 'admin'] as const) {
      this.emailUsers((result.reviewers ?? []).filter((r) => (r.roleKey === 'ops_lead') === (portal === 'ops')).map((r) => r.userId), {
        subject: 'Room changes are waiting for Operations',
        message: result.row.status === 'visit_required' ? 'A landlord requested a physical inspection for room changes. Schedule a visit or assign an inspector.' : 'A landlord submitted room changes for review.',
        path: `/${portal}/room-changes`, action: 'Open room changes',
      });
    }
    await this.notifications.notify(ctx.userId, result.row.status === 'visit_required' ? 'room_changes.visit_required' : 'room_changes.submitted', 'in_app', {
      message: result.row.status === 'visit_required'
        ? 'Your room changes were submitted. CampusHomes must complete a physical verification before they can be approved.'
        : 'Your room changes were submitted and are awaiting Operations review.',
      href: `/landlord/rooms?propertyId=${result.propertyId}`,
      propertyId: result.propertyId,
      changeSetId,
    });
    return { ...this.mapChangeSetRow(result.row), ...result.counts };
  }

  async cancelChangeSet(ctx: RlsContext, changeSetId: string) {
    await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await this.assertChangeSetOwner(client, changeSetId, ctx.userId, true);
      await client.query(`UPDATE room_inventory_change_sets SET status='cancelled', updated_at=now() WHERE id=$1`, [changeSetId]);
      await client.query(`UPDATE room_types SET archived_at=now() WHERE id IN (
        SELECT rtv.room_type_id FROM room_type_versions rtv WHERE rtv.change_set_id=$1
        GROUP BY rtv.room_type_id HAVING bool_and(rtv.status IN ('draft','rejected'))
      )`, [changeSetId]);
    });
    await this.audit.record(ctx, 'room_change_set.cancel', 'room_inventory_change_set', changeSetId, {});
    return { cancelled: true };
  }

  async reviewQueue(ctx: RlsContext) {
    return this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const result = await client.query<ChangeSetRow & { property_name: string; landlord_name: string; room_changes: number; type_changes: number }>(
        `SELECT cs.*, p.name property_name, u.name landlord_name,
          (SELECT count(*)::int FROM room_unit_changes c WHERE c.change_set_id=cs.id) room_changes,
          (SELECT count(*)::int FROM room_type_versions v WHERE v.change_set_id=cs.id) type_changes
         FROM room_inventory_change_sets cs JOIN properties p ON p.id=cs.property_id
         JOIN users u ON u.id=p.landlord_id
         WHERE cs.status IN ('pending_review','visit_required')
           AND public.app_staff_scope_for($1::uuid, $2::text, $3::boolean, cs.property_id, true)
         ORDER BY cs.submitted_at`,
        [ctx.userId, ctx.role, ctx.mfaVerified === true],
      );
      const items = [];
      for (const row of result.rows) {
        const typeChanges = await client.query<{
          id: string; title: string; category: string; capacity: number; price_per_term_ugx: number;
          old_title: string | null; old_category: string | null; old_capacity: number | null; old_price: number | null;
        }>(
          `SELECT proposed.id, proposed.title, proposed.category, proposed.capacity, proposed.price_per_term_ugx,
             current.title old_title, current.category old_category, current.capacity old_capacity,
             current.price_per_term_ugx old_price
           FROM room_type_versions proposed
           JOIN room_types rt ON rt.id=proposed.room_type_id
           LEFT JOIN room_type_versions current ON current.id=rt.current_version_id
           WHERE proposed.change_set_id=$1 ORDER BY proposed.created_at`,
          [row.id],
        );
        const roomChanges = await client.query<{
          id: string; action: 'create' | 'update' | 'archive' | 'capacity_change'; proposed_data: JsonRecord;
          label: string | null; building_name: string | null; floor_label: string | null; capacity: number | null;
        }>(
          `SELECT change.id, change.action, change.proposed_data, unit.label, unit.building_name,
             unit.floor_label, unit.capacity
           FROM room_unit_changes change LEFT JOIN units unit ON unit.id=change.unit_id
           WHERE change.change_set_id=$1 ORDER BY change.created_at`,
          [row.id],
        );
        items.push({
          ...this.mapChangeSetRow(row), propertyName: row.property_name, landlordName: row.landlord_name,
          physicalRoomChangesCount: Number(row.room_changes), roomTypeChangesCount: Number(row.type_changes),
          roomTypeChanges: typeChanges.rows.map((change) => ({
            id: change.id,
            before: change.old_title === null ? null : {
              title: change.old_title, category: change.old_category!, capacity: Number(change.old_capacity),
              pricePerTermUgx: Number(change.old_price),
            },
            after: { title: change.title, category: change.category, capacity: Number(change.capacity),
              pricePerTermUgx: Number(change.price_per_term_ugx) },
          })),
          physicalRoomChanges: roomChanges.rows.map((change) => ({
            id: change.id, action: change.action,
            before: change.label === null ? null : { roomCode: change.label, buildingName: change.building_name,
              floorLabel: change.floor_label, capacity: Number(change.capacity) },
            after: change.action === 'archive' ? null : {
              roomCode: String(change.proposed_data.roomCode ?? change.label ?? ''),
              buildingName: (change.proposed_data.buildingName ?? change.building_name ?? null) as string | null,
              floorLabel: (change.proposed_data.floorLabel ?? change.floor_label ?? null) as string | null,
              capacity: Number(change.proposed_data.capacity ?? change.capacity ?? 0),
            },
          })),
        });
      }
      return items;
    });
  }

  async approveChangeSet(ctx: RlsContext, changeSetId: string, notes?: string | null) {
    const result = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const set = await client.query<ChangeSetRow & { landlord_id: string }>(
        `SELECT cs.*, p.landlord_id FROM room_inventory_change_sets cs JOIN properties p ON p.id=cs.property_id
         WHERE cs.id=$1 AND cs.status IN ('pending_review','visit_required') FOR UPDATE`, [changeSetId],
      );
      const row = set.rows[0];
      if (!row) throw new ConflictException('Change set is no longer awaiting review');
      await assertStaffScope(client, ctx, row.property_id);
      if (row.status === 'visit_required') {
        const verified = await client.query(
          `SELECT 1 FROM verification_visits
           WHERE property_id=$1 AND result='passed' AND approved_at IS NOT NULL
             AND completed_at >= $2
           LIMIT 1`,
          [row.property_id, row.submitted_at],
        );
        if (!verified.rows.length) {
          throw new ConflictException('A passed and approved physical verification completed after this submission is required');
        }
      }

      // Read before applying, so renames still show the old code.
      const summary = await this.changeSummary(client, changeSetId, row.property_id);
      await this.applyChangeSet(client, row, ctx.userId, notes ?? null);
      return { landlordId: row.landlord_id, propertyId: row.property_id, summary };
    });
    await this.audit.record(ctx, 'room_change_set.approve', 'room_inventory_change_set', changeSetId, { notes });
    const approvedMessage = `Operations approved your room changes at ${result.summary}. They are live now.${notes ? ` Note: ${notes}` : ''}`;
    await this.notifications.notify(result.landlordId, 'room_changes.approved', 'in_app', {
      message: approvedMessage,
      href: `/landlord/rooms?propertyId=${result.propertyId}`,
    });
    this.emailUsers([result.landlordId], {
      subject: 'Your room changes were approved',
      message: approvedMessage,
      path: `/landlord/rooms?propertyId=${result.propertyId}`,
      action: 'View your rooms',
    });
    return { approved: true };
  }

  async rejectChangeSet(ctx: RlsContext, changeSetId: string, reason: string) {
    const result = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const target = await client.query<{ property_id: string }>(
        'SELECT property_id FROM room_inventory_change_sets WHERE id=$1 FOR UPDATE', [changeSetId],
      );
      if (!target.rows[0]) throw new ConflictException('Change set is no longer awaiting review');
      await assertStaffScope(client, ctx, target.rows[0].property_id);
      const updated = await client.query<{ landlord_id: string; property_id: string }>(
        `UPDATE room_inventory_change_sets cs SET status='rejected', reviewed_by=$2, reviewed_at=now(),
           rejection_reason=$3, updated_at=now()
         FROM properties p WHERE cs.id=$1 AND p.id=cs.property_id
           AND cs.status IN ('pending_review','visit_required')
         RETURNING p.landlord_id, cs.property_id`, [changeSetId, ctx.userId, reason],
      );
      if (!updated.rows[0]) throw new ConflictException('Change set is no longer awaiting review');
      await client.query(
        `UPDATE room_type_versions SET status='rejected', reviewed_by=$2, reviewed_at=now(), rejection_reason=$3
         WHERE change_set_id=$1`, [changeSetId, ctx.userId, reason],
      );
      return updated.rows[0];
    });
    await this.audit.record(ctx, 'room_change_set.reject', 'room_inventory_change_set', changeSetId, { reason });
    await this.notifications.notify(result.landlord_id, 'room_changes.rejected', 'in_app', {
      message: `Operations sent your room changes back for revision: ${reason}`,
      href: `/landlord/rooms?propertyId=${result.property_id}`,
    });
    this.emailUsers([result.landlord_id], {
      subject: 'Your room changes need revision',
      message: `CampusHomes Operations sent your room changes back: ${reason}`,
      path: `/landlord/rooms?propertyId=${result.property_id}`,
      action: 'Review your changes',
    });
    return { rejected: true };
  }

  /** Manage-only properties waiting for (or sent back from) Ops approval, in
   * the caller's staff scope. Inspectors see them too, to check the location. */
  async managedPropertyQueue(ctx: RlsContext) {
    return this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const result = await client.query(
        `SELECT p.id, p.name, p.street_address AS "streetAddress", p.location_details AS "locationDetails",
           p.catchment, p.created_at AS "createdAt", p.manage_review_status AS "reviewStatus",
           p.manage_rejection_reason AS "rejectionReason", p.authority_role AS "authorityRole",
           p.proposed_room_categories AS "proposedRoomCategories", p.cover_photo_key AS "coverPhotoKey",
           u.name AS "landlordName", coalesce(u.contact_phone, u.phone) AS "landlordPhone", u.email AS "landlordEmail",
           l.kyc_status AS "landlordKycStatus"
         FROM properties p JOIN users u ON u.id=p.landlord_id JOIN landlords l ON l.user_id=p.landlord_id
         WHERE p.listing_intent='manage_only' AND p.manage_review_status <> 'approved'
           AND public.app_staff_scope_for($1::uuid, $2::text, $3::boolean, p.id, false)
         ORDER BY p.manage_review_status, p.created_at`,
        [ctx.userId, ctx.role, ctx.mfaVerified === true],
      );
      return result.rows as unknown[];
    });
  }

  /** Ops approves a manage-only property after checking the basics (Festo,
   * 2026-11-01). The room types the landlord declared become real rooms now,
   * changes already made wait no longer, and later changes apply at once. */
  async approveManagedProperty(ctx: RlsContext, propertyId: string) {
    const result = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await assertStaffScope(client, ctx, propertyId);
      const property = (await client.query<{ landlord_id: string; name: string; listing_intent: string; manage_review_status: string }>(
        `SELECT landlord_id, name, listing_intent, manage_review_status FROM properties WHERE id=$1 FOR UPDATE`, [propertyId],
      )).rows[0];
      if (!property) throw new NotFoundException('Property not found');
      if (property.listing_intent !== 'manage_only') {
        throw new ConflictException('This property is listed to students, so it goes through the verification visit instead');
      }
      if (property.manage_review_status === 'approved') throw new ConflictException('This property is already approved');
      await client.query(
        `UPDATE properties SET manage_review_status='approved', manage_reviewed_at=now(), manage_reviewed_by=$2,
           manage_rejection_reason=NULL WHERE id=$1`, [propertyId, ctx.userId],
      );
      const roomsCreated = await this.createDeclaredRooms(client, propertyId, property.landlord_id, ctx.userId);
      await this.applyOpenChangeSets(client, propertyId, ctx.userId, ['draft', 'pending_review', 'visit_required'],
        'Applied when Operations approved this managed property');
      return { landlordId: property.landlord_id, name: property.name, roomsCreated };
    });
    await this.audit.record(ctx, 'properties.manage_approve', 'property', propertyId, { roomsCreated: result.roomsCreated });
    const message = `Operations approved ${result.name}. Your rooms are ready in Manage Rooms, and the changes you make there now apply at once.`;
    await this.notifications.notify(result.landlordId, 'property.manage_approved', 'in_app', {
      message, href: `/landlord/rooms?propertyId=${propertyId}`, propertyId,
    });
    this.emailUsers([result.landlordId], {
      subject: 'Your property is approved on CampusHomes',
      message,
      path: `/landlord/rooms?propertyId=${propertyId}`,
      action: 'Open Manage Rooms',
    });
    return { approved: true, roomsCreated: result.roomsCreated };
  }

  async rejectManagedProperty(ctx: RlsContext, propertyId: string, reason: string) {
    const result = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await assertStaffScope(client, ctx, propertyId);
      const updated = await client.query<{ landlord_id: string; name: string }>(
        `UPDATE properties SET manage_review_status='rejected', manage_reviewed_at=now(), manage_reviewed_by=$2,
           manage_rejection_reason=$3
         WHERE id=$1 AND listing_intent='manage_only' AND manage_review_status <> 'approved'
         RETURNING landlord_id, name`, [propertyId, ctx.userId, reason],
      );
      if (!updated.rows[0]) throw new ConflictException('This property is not waiting for approval');
      return updated.rows[0];
    });
    await this.audit.record(ctx, 'properties.manage_reject', 'property', propertyId, { reason });
    const message = `Operations could not approve ${result.name} yet: ${reason}`;
    await this.notifications.notify(result.landlord_id, 'property.manage_rejected', 'in_app', {
      message, href: '/landlord/properties', propertyId,
    });
    this.emailUsers([result.landlord_id], {
      subject: 'Your property needs a change before approval',
      message,
      path: '/landlord/properties',
      action: 'Open your properties',
    });
    return { rejected: true };
  }

  /** Turns the room types a landlord declared on the property form into real
   * rooms, beds and prices for the current semester. Skipped once the
   * property has any room type or room: those the landlord built in Manage
   * Rooms are the real inventory then. Returns the number of rooms made. */
  private async createDeclaredRooms(client: PoolClient, propertyId: string, landlordId: string, reviewerId: string) {
    const property = (await client.query<{ catchment: string; proposed: ProposedRoomCategory[] | null }>(
      `SELECT catchment, proposed_room_categories AS proposed FROM properties WHERE id=$1`, [propertyId],
    )).rows[0];
    const rows = property?.proposed ?? [];
    if (rows.length === 0) return 0;
    const existing = await client.query(
      // Archived ones don't count: a cancelled draft type leaves its row behind.
      `SELECT 1 FROM room_types WHERE property_id=$1 AND archived_at IS NULL
       UNION ALL SELECT 1 FROM units WHERE property_id=$1 AND archived_at IS NULL LIMIT 1`, [propertyId],
    );
    if (existing.rows.length) return 0;
    // Same choice as the Manage Rooms page's default semester.
    const semester = (await client.query<{ id: string }>(
      `SELECT id FROM semesters WHERE archived_at IS NULL AND ends_on >= current_date
         AND (university IS NULL OR university::text = $1)
       ORDER BY starts_on LIMIT 1`, [property!.catchment],
    )).rows[0];
    if (!semester) throw new ConflictException("No current semester is set up for this property's university, so its rooms can't be created");

    for (const row of rows) {
      const capacity = FIXED_BEDS_PER_ROOM[row.category] ?? row.bedsPerRoom ?? 1;
      const variant = row.variantName?.trim() || null;
      const typeId = (await client.query<{ id: string }>(
        `INSERT INTO room_types(property_id, created_by) VALUES ($1,$2) RETURNING id`, [propertyId, landlordId],
      )).rows[0]!.id;
      const versionId = (await client.query<{ id: string }>(
        `INSERT INTO room_type_versions(room_type_id, version_number, title, category, bathroom_type, capacity,
           amenities, semester_id, price_per_term_ugx, deposit_ugx, status, submitted_at, reviewed_by, reviewed_at, created_by)
         VALUES ($1,1,$2,$3,$4,$5,'[]'::jsonb,$6,$7,$8,'approved',now(),$9,now(),$10) RETURNING id`,
        [typeId, roomTypeTitle(row.category, variant), row.category, row.selfContained ? 'ensuite' : 'unspecified',
          capacity, semester.id, row.pricePerTermUgx, row.depositUgx ?? null, reviewerId, landlordId],
      )).rows[0]!.id;
      await client.query(`UPDATE room_types SET current_version_id=$2 WHERE id=$1`, [typeId, versionId]);
      for (const [index, key] of (row.photoKeys ?? []).entries()) {
        await client.query(
          `INSERT INTO room_type_photos(room_type_version_id, storage_key, sort_order, is_primary, uploaded_by)
           VALUES ($1,$2,$3,$4,$5)`, [versionId, key, index, index === 0, landlordId],
        );
      }
      // Specifications never create physical inventory. Room codes come only
      // from an explicit room entry, custom generation or spreadsheet import.

    }
    return 0;
  }

  private async overviewForProperty(ctx: RlsContext, propertyId: string) {
    const semesterId = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const row = await client.query<{ id: string }>(
        `SELECT semester_id id FROM room_inventory_change_sets
         WHERE property_id=$1 AND status IN ('draft','pending_review','visit_required','rejected')
         ORDER BY created_at DESC LIMIT 1`, [propertyId],
      );
      if (row.rows[0]) return row.rows[0].id;
      const fallback = await client.query<{ id: string }>(
        `SELECT id FROM semesters WHERE archived_at IS NULL ORDER BY starts_on LIMIT 1`,
      );
      if (!fallback.rows[0]) throw new BadRequestException('No active semester is configured');
      return fallback.rows[0].id;
    });
    return this.overview(ctx, propertyId, semesterId);
  }

  private async pendingRoom(ctx: RlsContext, propertyId: string, id: string) {
    const overview = await this.overviewForProperty(ctx, propertyId);
    const room = overview.rooms.find((candidate: { id: string }) => candidate.id === id);
    if (!room) throw new NotFoundException('Pending room change not found');
    return room;
  }

  /** Spreadsheet template for this property, one name per room type: the same
   * room types and open change set the Manage Rooms page shows for this
   * semester, named by roomTypeImportLabels so two types sharing a title still
   * get different names (the upload check matches them the same way). */
  async importTemplate(ctx: RlsContext, propertyId: string, format: 'xlsx' | 'csv', semesterId?: string) {
    const data = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await this.assertPropertyOwner(client, propertyId, ctx.userId);
      const changeSet = await this.openChangeSet(client, propertyId, semesterId);
      const roomTypes = await this.loadRoomTypes(client, propertyId, changeSet?.id ?? null);
      const labels = roomTypeImportLabels(roomTypes);
      const rooms = await this.loadRooms(client, propertyId, changeSet?.id ?? null);
      return { titles: [...labels.values()].sort((a, b) => a.localeCompare(b)), rooms: rooms.filter((room) => !('pendingRemoval' in room && room.pendingRemoval)).map((room) => ({
        id: room.id, roomCode: room.roomCode, buildingName: typeof room.buildingName === 'string' ? room.buildingName : null, floorLabel: typeof room.floorLabel === 'string' ? room.floorLabel : null, roomType: labels.get(room.roomTypeId) ?? room.roomTypeTitle,
      })) };
    });
    return roomImportTemplate(format, data.titles, data.rooms);
  }

  /** Serialize name checks on the property, including the first draft, so two
   * concurrent requests cannot both create an undescribed duplicate. IDs stay
   * distinct; a shared display name is allowed with a distinguishing description. */
  private async assertDistinctRoomTypeDescription(client: PoolClient, propertyId: string, input: RoomTypeInput, excludeId?: string) {
    await client.query(`SELECT id FROM properties WHERE id=$1 FOR UPDATE`, [propertyId]);
    const others = await client.query<{ title: string; description: string | null }>(
      `SELECT v.title, v.description FROM room_types rt JOIN room_type_versions v ON v.room_type_id=rt.id
       LEFT JOIN room_inventory_change_sets cs ON cs.id=v.change_set_id
       WHERE rt.property_id=$1 AND rt.archived_at IS NULL AND ($2::uuid IS NULL OR rt.id<>$2)
         AND (v.id=rt.current_version_id OR cs.status IN ('draft','rejected','pending_review','visit_required'))`,
      [propertyId, excludeId ?? null],
    );
    const duplicates = others.rows.filter((row) => normalizeRoomTypeName(row.title) === normalizeRoomTypeName(input.title));
    if (!duplicates.length) return;
    const description = normalizeRoomTypeName(input.description ?? '');
    if (!description || duplicates.some((row) => normalizeRoomTypeName(row.description ?? '') === description)) {
      throw new BadRequestException('This room type name is already used. Add a different description explaining its size, price or features.');
    }
  }

  private async assertPropertyOwner(client: PoolClient, propertyId: string, userId: string) {
    const result = await client.query(`SELECT 1 FROM properties WHERE id=$1 AND landlord_id=$2`, [propertyId, userId]);
    if (!result.rows.length) throw new ForbiddenException('You do not manage this property');
  }

  private async assertRoomTypeOwner(client: PoolClient, roomTypeId: string, userId: string, propertyId?: string) {
    const result = await client.query<{ id: string; property_id: string }>(
      `SELECT rt.id, rt.property_id FROM room_types rt JOIN properties p ON p.id=rt.property_id
       WHERE rt.id=$1 AND p.landlord_id=$2 AND rt.archived_at IS NULL`, [roomTypeId, userId],
    );
    const row = result.rows[0];
    if (!row || (propertyId && row.property_id !== propertyId)) throw new ForbiddenException('Room type does not belong to this property');
    return row;
  }

  private async assertUnitOwner(client: PoolClient, unitId: string, userId: string) {
    const result = await client.query<{ id: string; property_id: string; room_type_id: string; label: string }>(
      `SELECT u.id, u.property_id, u.room_type_id, u.label FROM units u JOIN properties p ON p.id=u.property_id
       WHERE u.id=$1 AND p.landlord_id=$2 AND u.archived_at IS NULL`, [unitId, userId],
    );
    if (!result.rows[0]) throw new ForbiddenException('Room does not belong to your property');
    return result.rows[0];
  }

  private async assertChangeSetOwner(client: PoolClient, id: string, userId: string, editable = false) {
    const result = await client.query<ChangeSetRow>(
      `SELECT cs.* FROM room_inventory_change_sets cs JOIN properties p ON p.id=cs.property_id
       WHERE cs.id=$1 AND p.landlord_id=$2 ${editable ? "AND cs.status IN ('draft','rejected')" : ''} FOR UPDATE`,
      [id, userId],
    );
    if (!result.rows[0]) throw new ConflictException('Change set is not editable');
    return result.rows[0];
  }

  private async openChangeSet(client: PoolClient, propertyId: string, semesterId?: string) {
    const params: unknown[] = [propertyId];
    let semesterClause = '';
    if (semesterId) { params.push(semesterId); semesterClause = 'AND semester_id=$2'; }
    const result = await client.query<ChangeSetRow>(
      `SELECT * FROM room_inventory_change_sets WHERE property_id=$1 ${semesterClause}
       AND status IN ('draft','pending_review','visit_required','rejected') ORDER BY created_at DESC LIMIT 1`, params,
    );
    return result.rows[0] ?? null;
  }

  private async getOrCreateDraft(client: PoolClient, propertyId: string, semesterId: string, userId: string) {
    await this.releaseWaitingChanges(client, propertyId, userId);
    const existing = await client.query<ChangeSetRow>(
      `SELECT * FROM room_inventory_change_sets WHERE property_id=$1 AND semester_id=$2
       AND status IN ('draft','pending_review','visit_required','rejected') FOR UPDATE`, [propertyId, semesterId],
    );
    if (existing.rows[0]) {
      if (['pending_review', 'visit_required'].includes(existing.rows[0].status)) {
        throw new ConflictException('This property already has changes awaiting Operations review');
      }
      if (existing.rows[0].status === 'rejected') {
        await client.query(`UPDATE room_inventory_change_sets SET status='draft', updated_at=now() WHERE id=$1`, [existing.rows[0].id]);
      }
      return { ...existing.rows[0], status: 'draft' };
    }
    const inserted = await client.query<ChangeSetRow>(
      `INSERT INTO room_inventory_change_sets(property_id, semester_id, submitted_by)
       VALUES ($1,$2,$3) RETURNING *`, [propertyId, semesterId, userId],
    );
    return inserted.rows[0]!;
  }

  private async roomTypeSemester(client: PoolClient, roomTypeId: string) {
    const result = await client.query<{ semester_id: string }>(
      `SELECT semester_id FROM room_type_versions WHERE room_type_id=$1
       ORDER BY CASE WHEN status IN ('draft','rejected') THEN 0 ELSE 1 END, version_number DESC LIMIT 1`, [roomTypeId],
    );
    if (!result.rows[0]) throw new BadRequestException('Room type has no specification');
    return result.rows[0].semester_id;
  }

  private async roomTypeCapacity(client: PoolClient, roomTypeId: string) {
    const result = await client.query<{ capacity: number }>(
      `SELECT capacity FROM room_type_versions WHERE room_type_id=$1
       ORDER BY CASE WHEN status IN ('draft','rejected') THEN 0 ELSE 1 END, version_number DESC LIMIT 1`, [roomTypeId],
    );
    if (!result.rows[0]) throw new BadRequestException('Room type has no specification');
    return Number(result.rows[0].capacity);
  }

  private async assertRoomCodeAvailable(
    client: PoolClient, propertyId: string, code: string, building: string | null, excludeId?: string,
  ) {
    const result = await client.query(
      `SELECT 1 FROM units WHERE property_id=$1 AND archived_at IS NULL
         AND lower(label)=lower($2) AND lower(COALESCE(building_name,''))=lower(COALESCE($3,''))
         AND ($4::uuid IS NULL OR id<>$4)
       UNION ALL
       SELECT 1 FROM room_unit_changes c JOIN room_inventory_change_sets cs ON cs.id=c.change_set_id
       WHERE cs.property_id=$1 AND cs.status IN ('draft','pending_review','visit_required','rejected')
         AND c.action IN ('create','update') AND lower(c.proposed_data->>'roomCode')=lower($2)
         AND lower(COALESCE(c.proposed_data->>'buildingName',''))=lower(COALESCE($3,''))
         AND ($4::uuid IS NULL OR c.id<>$4) LIMIT 1`, [propertyId, code, building, excludeId ?? null],
    );
    if (result.rows.length) throw new ConflictException(`Room code “${code}” already exists in this building`);
  }

  private async assertPhotoKeys(
    client: PoolClient,
    userId: string,
    photos: RoomTypeInput['photos'],
    roomTypeId?: string,
  ) {
    const foreignKeys = photos
      .map((photo) => photo.storageKey)
      .filter((key) => !isOwnedStorageKey(userId, key));
    if (foreignKeys.length === 0) return;

    if (!roomTypeId) {
      throw new BadRequestException('Room type photo does not belong to the signed-in uploader');
    }

    const attached = await client.query<{ storage_key: string }>(
      `SELECT DISTINCT photo.storage_key
       FROM room_type_photos photo
       JOIN room_type_versions version ON version.id=photo.room_type_version_id
       WHERE version.room_type_id=$1 AND photo.storage_key=ANY($2::text[])`,
      [roomTypeId, foreignKeys],
    );
    const retainedKeys = new Set(attached.rows.map((row) => row.storage_key));
    if (foreignKeys.some((key) => !retainedKeys.has(key))) {
      throw new BadRequestException('Room type photo does not belong to this room type or the signed-in uploader');
    }
  }

  private async insertVersion(client: PoolClient, roomTypeId: string, changeSetId: string, version: number, userId: string, input: RoomTypeInput) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO room_type_versions(room_type_id, change_set_id, version_number, title, category,
        bathroom_type, capacity, size_sqm, description, amenities, semester_id, price_per_term_ugx,
        deposit_ugx, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,'draft',$14) RETURNING id`,
      [roomTypeId, changeSetId, version, input.title, input.category, input.bathroomType, input.capacity,
        input.sizeSqm ?? null, input.description ?? null, JSON.stringify(input.amenities), input.semesterId,
        input.pricePerTermUgx, input.depositUgx ?? null, userId],
    );
    return inserted.rows[0]!.id;
  }

  private async replacePhotos(client: PoolClient, versionId: string, userId: string, photos: RoomTypeInput['photos']) {
    await client.query(`SELECT id FROM room_type_versions WHERE id=$1 FOR UPDATE`, [versionId]);
    await client.query(`DELETE FROM room_type_photos WHERE room_type_version_id=$1`, [versionId]);
    for (const [index, photo] of photos.entries()) {
      await client.query(
        `INSERT INTO room_type_photos(room_type_version_id, storage_key, sort_order, is_primary, uploaded_by)
         VALUES ($1,$2,$3,$4,$5)`, [versionId, photo.storageKey, index, photo.isPrimary || (index === 0 && !photos.some((p) => p.isPrimary)), userId],
      );
    }
  }

  private async loadRoomTypes(client: PoolClient, propertyId: string, changeSetId: string | null) {
    const types = await client.query<{ id: string; property_id: string; current_version_id: string | null; created_at: Date; attached_count: number }>(
      `SELECT rt.id, rt.property_id, rt.current_version_id, rt.created_at,
        count(u.id) FILTER (WHERE u.archived_at IS NULL)::int attached_count
       FROM room_types rt LEFT JOIN units u ON u.room_type_id=rt.id
       WHERE rt.property_id=$1 AND rt.archived_at IS NULL GROUP BY rt.id ORDER BY rt.created_at`, [propertyId],
    );
    const typeIds = types.rows.map((row) => row.id);
    const versions = await client.query<RoomTypeVersionRow>(
      `SELECT * FROM room_type_versions WHERE id=ANY($1::uuid[])
         OR (room_type_id=ANY($2::uuid[]) AND change_set_id=$3)
       ORDER BY version_number DESC`,
      [types.rows.flatMap((row) => row.current_version_id ? [row.current_version_id] : []), typeIds, changeSetId],
    );
    const photos = await client.query<RoomTypePhotoRow>(
      `SELECT * FROM room_type_photos WHERE room_type_version_id=ANY($1::uuid[]) ORDER BY sort_order`,
      [versions.rows.map((row) => row.id)],
    );
    const byId = new Map(versions.rows.map((row) => [row.id, row]));
    const pendingByType = new Map<string, RoomTypeVersionRow>();
    const photosByVersion = new Map<string, RoomTypePhotoRow[]>();
    for (const version of versions.rows) {
      // Current versions may be from another change set. Only the selected
      // change set belongs in pendingVersion (preserve the original contract).
      if (changeSetId && version.change_set_id === changeSetId && !pendingByType.has(version.room_type_id)) pendingByType.set(version.room_type_id, version);
    }
    for (const photo of photos.rows) {
      const group = photosByVersion.get(photo.room_type_version_id) ?? [];
      group.push(photo);
      photosByVersion.set(photo.room_type_version_id, group);
    }
    return types.rows.map((type) => {
      const current = type.current_version_id ? byId.get(type.current_version_id) : null;
      const pending = pendingByType.get(type.id);
      return {
        id: type.id, propertyId: type.property_id, currentVersionId: type.current_version_id,
        currentVersion: current ? this.mapVersion(current, photosByVersion.get(current.id) ?? []) : null,
        pendingVersion: pending ? this.mapVersion(pending, photosByVersion.get(pending.id) ?? []) : null,
        attachedRoomsCount: Number(type.attached_count), createdAt: type.created_at.toISOString(),
      };
    });
  }

  private mapVersion(row: RoomTypeVersionRow, photos: RoomTypePhotoRow[]) {
    return {
      id: row.id, roomTypeId: row.room_type_id, versionNumber: Number(row.version_number), title: row.title,
      category: row.category, bathroomType: row.bathroom_type, capacity: Number(row.capacity), sizeSqm: row.size_sqm,
      description: row.description, amenities: row.amenities ?? [], semesterId: row.semester_id,
      pricePerTermUgx: Number(row.price_per_term_ugx), depositUgx: row.deposit_ugx === null ? null : Number(row.deposit_ugx),
      status: row.status, rejectionReason: row.rejection_reason, reviewerNotes: row.reviewer_notes,
      submittedAt: row.submitted_at?.toISOString() ?? null, reviewedAt: row.reviewed_at?.toISOString() ?? null,
      photos: photos.map((photo) => ({ id: photo.id, storageKey: photo.storage_key,
        sortOrder: Number(photo.sort_order), isPrimary: photo.is_primary, uploadedBy: photo.uploaded_by,
        createdAt: photo.created_at.toISOString() })),
    };
  }

  /** Ensures every live physical room is linked to a room type. For each
   * category that has unlinked units, reuse an existing live room type of that
   * category if present, otherwise create a baseline (approved) one derived
   * from the units' own capacity/pricing, then link the orphan units. Only
   * touches units whose room_type_id is NULL — beds, pricing and listings are
   * left untouched, so the public listing/reservation path is unaffected.
   * Idempotent: once linked there are no orphans, so it no-ops thereafter. */
  private async ensureCategoryRoomTypes(client: PoolClient, propertyId: string, semesterId: string, userId: string) {
    const orphanCategories = await client.query<{ category: string }>(
      `SELECT DISTINCT room_category::text AS category FROM units
       WHERE property_id=$1 AND archived_at IS NULL AND room_type_id IS NULL`,
      [propertyId],
    );
    for (const { category } of orphanCategories.rows) {
      const existing = await client.query<{ id: string }>(
        `SELECT rt.id FROM room_types rt JOIN room_type_versions v ON v.id=rt.current_version_id
         WHERE rt.property_id=$1 AND v.category=$2 LIMIT 1`,
        [propertyId, category],
      );
      let roomTypeId = existing.rows[0]?.id;
      if (!roomTypeId) {
        const info = await client.query<{ capacity: number; price: number | null; deposit: number | null }>(
          `SELECT u.capacity, usp.price_per_term_ugx AS price, usp.deposit_ugx AS deposit
           FROM units u LEFT JOIN unit_semester_pricing usp ON usp.unit_id=u.id AND usp.semester_id=$3
           WHERE u.property_id=$1 AND u.room_category::text=$2 AND u.archived_at IS NULL
           ORDER BY usp.price_per_term_ugx NULLS LAST LIMIT 1`,
          [propertyId, category, semesterId],
        );
        const capacity = Number(info.rows[0]?.capacity ?? 1);
        const price = Number(info.rows[0]?.price ?? 0);
        const deposit = info.rows[0]?.deposit ?? null;
        const title = category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ') + ' Room';
        const rt = await client.query<{ id: string }>(
          `INSERT INTO room_types(property_id, created_by) VALUES($1,$2) RETURNING id`,
          [propertyId, userId],
        );
        roomTypeId = rt.rows[0]!.id;
        const ver = await client.query<{ id: string }>(
          `INSERT INTO room_type_versions(room_type_id, change_set_id, version_number, title, category,
             capacity, semester_id, price_per_term_ugx, deposit_ugx, status, created_by)
           VALUES($1,NULL,1,$2,$3,$4,$5,$6,$7,'approved',$8) RETURNING id`,
          [roomTypeId, title, category, capacity, semesterId, price, deposit, userId],
        );
        await client.query(`UPDATE room_types SET current_version_id=$2 WHERE id=$1`, [roomTypeId, ver.rows[0]!.id]);
      }
      await client.query(
        `UPDATE units SET room_type_id=$3
         WHERE property_id=$1 AND room_category::text=$2 AND room_type_id IS NULL AND archived_at IS NULL`,
        [propertyId, category, roomTypeId],
      );
    }
  }

  private async loadRooms(client: PoolClient, propertyId: string, changeSetId: string | null) {
    const units = await client.query<{
      id: string; property_id: string; room_type_id: string; label: string; capacity: number; room_category: string;
      building_name: string | null; floor_label: string | null; operational_status: string;
      type_title: string; pending: boolean; pending_removal: boolean;
    }>(
      `SELECT u.id,u.property_id,u.room_type_id,u.label,u.capacity,u.room_category::text,u.building_name,u.floor_label,
        u.operational_status, COALESCE(cv.title, initcap(replace(u.room_category::text,'_',' ')) || ' Room') type_title,
        EXISTS(SELECT 1 FROM room_unit_changes c JOIN room_inventory_change_sets cs ON cs.id=c.change_set_id
               WHERE c.unit_id=u.id AND cs.status IN ('draft','pending_review','visit_required','rejected')) pending,
        EXISTS(SELECT 1 FROM room_unit_changes c JOIN room_inventory_change_sets cs ON cs.id=c.change_set_id
               WHERE c.unit_id=u.id AND c.action='archive'
                 AND cs.status IN ('draft','pending_review','visit_required','rejected')) pending_removal
       FROM units u JOIN room_types rt ON rt.id=u.room_type_id
       LEFT JOIN room_type_versions cv ON cv.id=rt.current_version_id
       WHERE u.property_id=$1 AND u.archived_at IS NULL ORDER BY u.building_name NULLS FIRST,u.floor_label NULLS FIRST,u.label`, [propertyId],
    );
    const beds = await client.query<RoomBedRow>(
      `SELECT b.id,b.unit_id,b.label,b.blocked,b.blocked_reason,r.id reservation_id,r.status::text,r.reserved_expires_at,r.booked_at,
        su.name student_name,coalesce(su.contact_phone,su.phone) student_phone
       FROM beds b LEFT JOIN LATERAL (
         SELECT * FROM reservations r WHERE r.bed_id=b.id AND r.status IN ('reserved','booked','occupied')
         ORDER BY r.created_at DESC LIMIT 1
       ) r ON true LEFT JOIN users su ON su.id=r.student_id
       WHERE b.unit_id=ANY($1::uuid[]) AND b.retired_at IS NULL ORDER BY b.label`, [units.rows.map((unit) => unit.id)],
    );
    const blocks = await client.query<RoomBlockRow>(
      `SELECT * FROM unit_blocks WHERE unit_id=ANY($1::uuid[])
       AND cleared_at IS NULL AND (ends_at IS NULL OR ends_at>now())
       ORDER BY unit_id,starts_at`, [units.rows.map((unit) => unit.id)],
    );
    const bedsByUnit = new Map<string, RoomBedRow[]>();
    for (const bed of beds.rows) {
      const group = bedsByUnit.get(bed.unit_id) ?? [];
      group.push(bed);
      bedsByUnit.set(bed.unit_id, group);
    }
    const blocksByUnit = new Map<string, RoomBlockRow[]>();
    for (const block of blocks.rows) {
      const group = blocksByUnit.get(block.unit_id) ?? [];
      group.push(block);
      blocksByUnit.set(block.unit_id, group);
    }
    const changes = changeSetId ? (await client.query<{
      id: string; unit_id: string | null; action: string; room_type_id: string; proposed_data: JsonRecord;
    }>(`SELECT id,unit_id,action,room_type_id,proposed_data FROM room_unit_changes
       WHERE change_set_id=$1 AND action IN ('create','update') ORDER BY created_at`, [changeSetId])).rows : [];
    const updatesByUnit = new Map(changes.filter((change) => change.action === 'update').map((change) => [change.unit_id, change]));
    const specs = changes.length ? (await client.query<{ room_type_id: string; title: string; category: string; capacity: number }>(
      `SELECT DISTINCT ON (room_type_id) room_type_id,title,category,capacity FROM room_type_versions
       WHERE room_type_id=ANY($1::uuid[])
       ORDER BY room_type_id,CASE WHEN status IN ('draft','rejected','pending_review','visit_required') THEN 0 ELSE 1 END,version_number DESC`,
      [[...new Set(changes.map((change) => change.room_type_id))]],
    )).rows : [];
    const specsByType = new Map(specs.map((spec) => [spec.room_type_id, spec]));
    const output = [];
    for (const unit of units.rows) {
      const mapped = this.mapUnit(unit, bedsByUnit.get(unit.id) ?? [], blocksByUnit.get(unit.id));
      if (unit.pending_removal) Object.assign(mapped, { pendingRemoval: true });
      const pending = updatesByUnit.get(unit.id);
      if (pending) {
        const data = pending.proposed_data;
        const spec = specsByType.get(pending.room_type_id);
        Object.assign(mapped, {
          roomTypeId: pending.room_type_id,
          roomTypeTitle: spec?.title ?? mapped.roomTypeTitle,
          roomCategory: spec?.category ?? mapped.roomCategory,
          roomCode: data.roomCode ?? mapped.roomCode,
          buildingName: data.buildingName ?? null,
          floorLabel: data.floorLabel ?? null,
          capacity: Number(spec?.capacity ?? mapped.capacity),
          pendingChanges: true,
        });
      }
      output.push(mapped);
    }

    if (changeSetId) {
      for (const change of changes.filter((change) => change.action === 'create')) {
        const data = change.proposed_data;
        const spec = specsByType.get(change.room_type_id);
        const capacity = Number(data.capacity ?? spec?.capacity ?? 1);
        output.push({
          id: change.id, propertyId, roomTypeId: change.room_type_id,
          roomTypeTitle: spec?.title ?? 'Room', roomCategory: spec?.category ?? 'other',
          roomCode: String(data.roomCode ?? ''), buildingName: data.buildingName ?? null, floorLabel: data.floorLabel ?? null,
          capacity, totalBeds: capacity, occupiedBeds: 0, derivedStatus: 'available', activeBlock: null, scheduledBlocks: [],
          pendingChanges: true,
          beds: Array.from({ length: capacity }, (_, index) => ({ id: `${change.id}-bed-${index + 1}`,
            unitId: change.id, label: `Bed ${index + 1}`, blocked: false, status: 'available' })),
        });
      }
    }
    return output;
  }

  private mapUnit(unit: {
    id: string; property_id: string; room_type_id: string; label: string; capacity: number; room_category: string;
    building_name: string | null; floor_label: string | null; operational_status: string; type_title: string; pending: boolean;
  }, beds: RoomBedRow[], blocks: RoomBlockRow[] = []) {
    const mappedBeds = beds.map((bed) => ({
      id: bed.id, unitId: unit.id, label: bed.label, blocked: bed.blocked, blockedReason: bed.blocked_reason,
      status: bed.blocked ? 'blocked' : bed.status ?? 'available', studentName: bed.student_name,
      studentPhone: bed.student_phone, reservationId: bed.reservation_id,
      reservedExpiresAt: bed.reserved_expires_at?.toISOString() ?? null, bookedAt: bed.booked_at?.toISOString() ?? null,
    }));
    const occupiedBeds = mappedBeds.filter((bed) => ['reserved','booked','occupied'].includes(bed.status)).length;
    const activeBeds = mappedBeds.filter((bed) => !bed.blocked);
    const now = Date.now();
    const block = blocks.find((row) => row.starts_at.getTime() <= now && (!row.ends_at || row.ends_at.getTime() > now));
    const activeBlock = block ? this.mapBlock(block) : null;
    const scheduledBlocks = blocks.filter((row) => row.starts_at.getTime() > now).map((row) => this.mapBlock(row));
    const derivedStatus = activeBlock || unit.operational_status === 'blocked' || unit.operational_status === 'under_maintenance'
      ? 'blocked'
      : activeBeds.length === 0 ? 'blocked'
      : occupiedBeds === 0 ? 'available'
      : occupiedBeds >= activeBeds.length ? 'fully_occupied' : 'partially_occupied';
    return {
      id: unit.id, propertyId: unit.property_id, roomTypeId: unit.room_type_id, roomTypeTitle: unit.type_title,
      roomCategory: unit.room_category, roomCode: unit.label, buildingName: unit.building_name, floorLabel: unit.floor_label,
      capacity: Number(unit.capacity), totalBeds: mappedBeds.length, occupiedBeds, derivedStatus, activeBlock, scheduledBlocks,
      pendingChanges: unit.pending, beds: mappedBeds,
    };
  }

  private mapBlock(row: {
    id: string; unit_id: string; reason: string; starts_at: Date; ends_at: Date | null; notes: string | null;
    created_by: string; cleared_at: Date | null; created_at: Date;
  }) {
    return { id: row.id, unitId: row.unit_id, reason: row.reason, startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at?.toISOString() ?? null, notes: row.notes, createdBy: row.created_by,
      clearedAt: row.cleared_at?.toISOString() ?? null, createdAt: row.created_at.toISOString() };
  }

  private async mapChangeSet(client: PoolClient, row: ChangeSetRow) {
    return { ...this.mapChangeSetRow(row), ...await this.changeCounts(client, row.id) };
  }

  private mapChangeSetRow(row: ChangeSetRow) {
    return { id: row.id, propertyId: row.property_id, semesterId: row.semester_id, status: row.status,
      submittedAt: row.submitted_at?.toISOString() ?? null, reviewerNotes: row.reviewer_notes,
      rejectionReason: row.rejection_reason };
  }

  private async changeCounts(client: PoolClient, id: string) {
    const result = await client.query<{ rooms: number; types: number }>(
      `SELECT (SELECT count(*)::int FROM room_unit_changes WHERE change_set_id=$1) rooms,
              (SELECT count(*)::int FROM room_type_versions WHERE change_set_id=$1) types`, [id],
    );
    return { physicalRoomChangesCount: Number(result.rows[0]?.rooms ?? 0), roomTypeChangesCount: Number(result.rows[0]?.types ?? 0) };
  }

  /** Applies every change in the set and marks it approved. Returns the new
   * unit id of each 'create' change, keyed by change id. */
  private async applyChangeSet(client: PoolClient, set: ChangeSetRow, reviewerId: string, notes: string | null) {
    const versions = await client.query<RoomTypeVersionRow>(
      `SELECT * FROM room_type_versions WHERE change_set_id=$1 ORDER BY version_number`, [set.id],
    );
    for (const version of versions.rows) {
      await this.applyRoomTypeVersion(client, version, set.semester_id, reviewerId, notes);
    }
    const changes = await client.query<{ id: string; action: string; unit_id: string | null; room_type_id: string | null; proposed_data: JsonRecord }>(
      `SELECT * FROM room_unit_changes WHERE change_set_id=$1 ORDER BY created_at`, [set.id],
    );
    const created = new Map<string, string>();
    for (const change of changes.rows) {
      const unitId = await this.applyUnitChange(client, change, set.semester_id);
      if (unitId) created.set(change.id, unitId);
    }
    await client.query(
      `UPDATE room_inventory_change_sets SET status='approved', submitted_at=COALESCE(submitted_at, now()),
         reviewed_by=$2, reviewed_at=now(), reviewer_notes=$3, rejection_reason=NULL, updated_at=now() WHERE id=$1`,
      [set.id, reviewerId, notes],
    );
    return created;
  }

  /** Applies this property's open change sets in the given statuses, oldest first. */
  private async applyOpenChangeSets(client: PoolClient, propertyId: string, reviewerId: string, statuses: string[], notes: string) {
    const sets = await client.query<ChangeSetRow>(
      `SELECT * FROM room_inventory_change_sets WHERE property_id=$1 AND status = ANY($2::text[])
       ORDER BY created_at FOR UPDATE`, [propertyId, statuses],
    );
    const created = new Map<string, string>();
    for (const set of sets.rows) {
      for (const [changeId, unitId] of await this.applyChangeSet(client, set, reviewerId, notes)) created.set(changeId, unitId);
    }
    return created;
  }

  /** A property is past its first approval once Ops approved it as
   * manage-only (2026-11-01) or its listing passed inspection and is live.
   * From then on the landlord's room changes need no review (Festo,
   * 2026-11-10): only a first-time property waits for Ops. */
  private async appliesAtOnce(client: PoolClient, propertyId: string): Promise<boolean> {
    const established = await client.query(
      `SELECT 1 FROM properties p WHERE p.id=$1 AND (
         (p.listing_intent='manage_only' AND p.manage_review_status='approved')
         OR (p.listing_intent='list' AND EXISTS(
           SELECT 1 FROM listings l WHERE l.property_id=p.id AND l.status='verified')))`,
      [propertyId],
    );
    return established.rows.length > 0;
  }

  /** On an established property (see appliesAtOnce) every landlord room
   * write applies its draft in the same transaction and tells Operations
   * what changed. Returns null while changes still wait for review. */
  private async applyIfEstablished(client: PoolClient, propertyId: string, landlordId: string, statuses = ['draft']) {
    if (!(await this.appliesAtOnce(client, propertyId))) return null;
    // Read before applying, so renames still show the old code.
    const sets = await client.query<{ id: string }>(
      `SELECT id FROM room_inventory_change_sets WHERE property_id=$1 AND status = ANY($2::text[]) ORDER BY created_at FOR UPDATE`,
      [propertyId, statuses],
    );
    const notices = [];
    for (const set of sets.rows) notices.push({ id: set.id,
      summary: await this.changeSummary(client, set.id, propertyId),
      changes: await this.changeDetails(client, set.id),
    });
    const created = await this.applyOpenChangeSets(client, propertyId, landlordId, statuses, 'Applied at once: this property is past its first Operations approval');
    for (const notice of notices) await recordOperationsNotice(client, propertyId, 'room_changes.applied',
      `A landlord changed rooms at ${notice.summary}. The changes are live; no approval is needed.`,
      { changeSetId: notice.id, changes: notice.changes });
    return created;
  }

  /** Applies changes sent for review before the property was established.
   * One that can no longer apply as sent (a room to remove has since been
   * reserved, say) goes back to the landlord with the reason instead of
   * failing every later page load and edit for the property. */
  private async releaseWaitingChanges(client: PoolClient, propertyId: string, landlordId: string) {
    await client.query('SAVEPOINT release_waiting');
    try {
      await this.applyIfEstablished(client, propertyId, landlordId, WAITING_FOR_REVIEW);
      await client.query('RELEASE SAVEPOINT release_waiting');
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      await client.query('ROLLBACK TO SAVEPOINT release_waiting');
      const returned = await client.query<{ id: string }>(
        `UPDATE room_inventory_change_sets SET status='rejected', rejection_reason=$3, updated_at=now()
         WHERE property_id=$1 AND status = ANY($2::text[]) RETURNING id`,
        [propertyId, WAITING_FOR_REVIEW, `These changes can no longer be applied: ${error.message}. Change or discard them.`],
      );
      await client.query(
        `UPDATE room_type_versions SET status='rejected', rejection_reason=$2 WHERE change_set_id = ANY($1::uuid[])`,
        [returned.rows.map((row) => row.id), error.message],
      );
    }
  }

  private async applyRoomTypeVersion(client: PoolClient, version: RoomTypeVersionRow, semesterId: string, reviewerId: string, notes: string | null) {
    await client.query(
      `UPDATE room_type_versions SET status='approved', reviewed_by=$2, reviewed_at=now(), reviewer_notes=$3,
       rejection_reason=NULL WHERE id=$1`, [version.id, reviewerId, notes],
    );
    await client.query(`UPDATE room_types SET current_version_id=$2, updated_at=now() WHERE id=$1`, [version.room_type_id, version.id]);
    const attached = await client.query<{ id: string; capacity: number }>(
      `SELECT id,capacity FROM units WHERE room_type_id=$1 AND archived_at IS NULL FOR UPDATE`, [version.room_type_id],
    );
    for (const unit of attached.rows) {
      await this.resizeBeds(client, unit.id, Number(unit.capacity), Number(version.capacity));
      await client.query(`UPDATE units SET capacity=$2, room_category=$3 WHERE id=$1`, [unit.id, version.capacity, version.category]);
      await client.query(
        `INSERT INTO unit_semester_pricing(unit_id,semester_id,price_per_term_ugx,deposit_ugx)
         VALUES($1,$2,$3,$4) ON CONFLICT(unit_id,semester_id) DO UPDATE SET
           price_per_term_ugx=EXCLUDED.price_per_term_ugx,deposit_ugx=EXCLUDED.deposit_ugx`,
        [unit.id, semesterId, version.price_per_term_ugx, version.deposit_ugx],
      );
    }
  }

  /** Returns the new unit's id for a 'create' change. */
  private async applyUnitChange(client: PoolClient, change: {
    id: string; action: string; unit_id: string | null; room_type_id: string | null; proposed_data: JsonRecord;
  }, semesterId: string): Promise<string | null> {
    if (change.action === 'archive' && change.unit_id) {
      const live = await client.query(`SELECT 1 FROM reservations r JOIN beds b ON b.id=r.bed_id
        WHERE b.unit_id=$1 AND r.status IN ('reserved','booked','occupied') LIMIT 1`, [change.unit_id]);
      if (live.rows.length) throw new ConflictException('A room gained a live reservation and can no longer be archived');
      await client.query(`UPDATE units SET archived_at=now(),operational_status='blocked' WHERE id=$1`, [change.unit_id]);
      return null;
    }
    if (!change.room_type_id) throw new BadRequestException('Room change has no room type');
    const spec = await client.query<{ capacity: number; category: string; price_per_term_ugx: number; deposit_ugx: number | null }>(
      `SELECT capacity,category,price_per_term_ugx,deposit_ugx FROM room_type_versions
       WHERE room_type_id=$1 AND status='approved' ORDER BY version_number DESC LIMIT 1`, [change.room_type_id],
    );
    const version = spec.rows[0];
    if (!version) throw new BadRequestException('Room type is not approved');
    const data = change.proposed_data;
    if (change.action === 'create') {
      const unit = await client.query<{ id: string }>(
        `INSERT INTO units(property_id,room_type_id,label,capacity,room_category,building_name,floor_label,amenities)
         SELECT cs.property_id,$2,$3,$4,$5,$6,$7,'{}'::jsonb FROM room_inventory_change_sets cs WHERE cs.id=(SELECT change_set_id FROM room_unit_changes WHERE id=$1)
         RETURNING id`, [change.id, change.room_type_id, data.roomCode, version.capacity, version.category, data.buildingName ?? null, data.floorLabel ?? null],
      );
      const unitId = unit.rows[0]!.id;
      await this.resizeBeds(client, unitId, 0, Number(version.capacity));
      await client.query(`INSERT INTO unit_semester_pricing(unit_id,semester_id,price_per_term_ugx,deposit_ugx) VALUES($1,$2,$3,$4)`,
        [unitId, semesterId, version.price_per_term_ugx, version.deposit_ugx]);
      return unitId;
    }
    if (change.action === 'update' && change.unit_id) {
      const current = await client.query<{ capacity: number }>(`SELECT capacity FROM units WHERE id=$1 FOR UPDATE`, [change.unit_id]);
      if (!current.rows[0]) throw new NotFoundException('Room no longer exists');
      await this.resizeBeds(client, change.unit_id, Number(current.rows[0].capacity), Number(version.capacity));
      await client.query(
        `UPDATE units SET room_type_id=$2,label=$3,capacity=$4,room_category=$5,building_name=$6,floor_label=$7 WHERE id=$1`,
        [change.unit_id, change.room_type_id, data.roomCode, version.capacity, version.category, data.buildingName ?? null, data.floorLabel ?? null],
      );
      await client.query(
        `INSERT INTO unit_semester_pricing(unit_id,semester_id,price_per_term_ugx,deposit_ugx) VALUES($1,$2,$3,$4)
         ON CONFLICT(unit_id,semester_id) DO UPDATE SET price_per_term_ugx=EXCLUDED.price_per_term_ugx,deposit_ugx=EXCLUDED.deposit_ugx`,
        [change.unit_id, semesterId, version.price_per_term_ugx, version.deposit_ugx],
      );
    }
    return null;
  }

  private async resizeBeds(client: PoolClient, unitId: string, oldCapacity: number, newCapacity: number) {
    if (newCapacity > oldCapacity) {
      for (let index = oldCapacity + 1; index <= newCapacity; index++) {
        await client.query(`INSERT INTO beds(unit_id,label) VALUES($1,$2)`, [unitId, `Bed ${index}`]);
      }
    } else if (newCapacity < oldCapacity) {
      const removable = await client.query<{ id: string }>(
        `SELECT b.id FROM beds b WHERE b.unit_id=$1 AND b.retired_at IS NULL
         AND NOT EXISTS(SELECT 1 FROM reservations r WHERE r.bed_id=b.id AND r.status IN ('reserved','booked','occupied'))
         ORDER BY b.label DESC LIMIT $2`, [unitId, oldCapacity - newCapacity],
      );
      if (removable.rows.length !== oldCapacity - newCapacity) {
        throw new ConflictException('Capacity cannot be reduced while affected bedspaces have live reservations');
      }
      await client.query(`UPDATE beds SET retired_at=now(),blocked=true,blocked_reason='Retired after approved capacity reduction'
        WHERE id=ANY($1::uuid[])`, [removable.rows.map((row) => row.id)]);
    }
  }

  async activity(ctx: RlsContext) {
    return this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const { rows } = await client.query(
        `SELECT n.id, n.payload, n.created_at, p.name property_name,
           coalesce(nullif(u.name,''),nullif(l.legal_name,''),'Landlord') landlord_name FROM notifications n
         JOIN properties p ON p.id::text=n.payload->>'propertyId'
         JOIN users u ON u.id=p.landlord_id LEFT JOIN landlords l ON l.user_id=p.landlord_id
         WHERE n.user_id=$1 AND n.template_key IN ('room_changes.applied','property.updated')
           AND public.app_staff_scope_for($1::uuid,$2::text,$3::boolean,p.id,true)
         ORDER BY n.created_at DESC, n.id LIMIT 100`, [ctx.userId, ctx.role, ctx.mfaVerified === true]);
      return rows.map((row) => ({ id: row.id, ...row.payload, propertyName: row.property_name, landlordName: row.landlord_name, createdAt: row.created_at.toISOString() }));
    });
  }

  /** Capture before applying: live rows will have changed by the time Ops reads. */
  private async changeDetails(client: PoolClient, changeSetId: string): Promise<OperationChange[]> {
    const changes: OperationChange[] = [];
    const display = (value: unknown): string => value == null || value === '' ? 'Not set'
      : Array.isArray(value) ? value.join(', ') || 'None' : String(value);
    const compare = (name: string, before: JsonRecord, after: JsonRecord, labels: Record<string, string>) => {
      for (const [key, label] of Object.entries(labels)) {
        if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
          changes.push({ label: `${name} · ${label}`, before: display(before[key]), after: display(after[key]) });
        }
      }
    };
    const types = await client.query<{ title: string; before: JsonRecord | null; after: JsonRecord }>(
      `SELECT v.title, to_jsonb(old) AS before, to_jsonb(v) AS after
       FROM room_type_versions v JOIN room_types rt ON rt.id=v.room_type_id
       LEFT JOIN room_type_versions old ON old.id=rt.current_version_id WHERE v.change_set_id=$1`, [changeSetId]);
    for (const row of types.rows) {
      compare(row.title, row.before ?? {}, row.after, { title: 'Name', category: 'Category', capacity: 'Beds',
        bathroom_type: 'Bathroom', size_sqm: 'Size (m²)', description: 'Description', amenities: 'Amenities',
        price_per_term_ugx: 'Term price (UGX)', deposit_ugx: 'Deposit (UGX)' });
      const photos = await client.query<{ version_id: string; keys: string[] }>(
        `SELECT room_type_version_id version_id, array_agg(storage_key ORDER BY sort_order,id) keys
         FROM room_type_photos WHERE room_type_version_id=ANY($1::uuid[]) GROUP BY room_type_version_id`,
        [[row.before?.id, row.after.id].filter(Boolean)]);
      const oldPhotos = photos.rows.find((p) => p.version_id === row.before?.id)?.keys ?? [];
      const newPhotos = photos.rows.find((p) => p.version_id === row.after.id)?.keys ?? [];
      if (JSON.stringify(oldPhotos) !== JSON.stringify(newPhotos)) changes.push({ label: `${row.title} · Photos`,
        before: `${oldPhotos.length} photos`, after: `${newPhotos.length} photos (updated)` });
    }
    const units = await client.query<{ action: string; before: JsonRecord | null; after: JsonRecord; title: string | null; capacity: number | null }>(
      `SELECT c.action, to_jsonb(u) AS before, c.proposed_data AS after, v.title, v.capacity
       FROM room_unit_changes c LEFT JOIN units u ON u.id=c.unit_id
       LEFT JOIN room_types rt ON rt.id=c.room_type_id
       LEFT JOIN room_type_versions v ON v.id=rt.current_version_id WHERE c.change_set_id=$1`, [changeSetId]);
    for (const row of units.rows) {
      const name = String(row.before?.label ?? row.after.roomCode ?? 'Room');
      if (row.action === 'archive') { changes.push({ label: `${name} · Room`, before: 'Active', after: 'Archived' }); continue; }
      compare(name, { roomCode: row.before?.label, buildingName: row.before?.building_name,
        floorLabel: row.before?.floor_label, roomTypeId: row.before?.room_type_id, capacity: row.before?.capacity },
      { ...row.after, capacity: row.after.capacity ?? row.capacity },
      { roomCode: 'Room code', buildingName: 'Building', floorLabel: 'Floor', capacity: 'Beds' });
      if (row.before?.room_type_id !== row.after.roomTypeId && row.title) changes.push({ label: `${name} · Room type`, before: row.before ? 'Previous room type' : 'New room', after: row.title });
    }
    return changes;
  }

  /** "Mirembe Courts: 3 rooms (Double 1 → A01, …) and 1 room type", for notices. */
  private async changeSummary(client: PoolClient, changeSetId: string, propertyId: string): Promise<string> {
    const property = (await client.query<{ name: string }>(`SELECT name FROM properties WHERE id=$1`, [propertyId])).rows[0];
    const rooms = (await client.query<{ action: string; old_code: string | null; new_code: string | null }>(
      `SELECT c.action, u.label AS old_code, c.proposed_data->>'roomCode' AS new_code
       FROM room_unit_changes c LEFT JOIN units u ON u.id = c.unit_id
       WHERE c.change_set_id=$1 ORDER BY c.created_at`, [changeSetId],
    )).rows;
    const types = (await client.query(`SELECT 1 FROM room_type_versions WHERE change_set_id=$1`, [changeSetId])).rowCount ?? 0;
    const shown = rooms.slice(0, 5).map((room) =>
      room.action === 'create' ? `new ${room.new_code}`
        : room.old_code && room.new_code && room.old_code !== room.new_code ? `${room.old_code} → ${room.new_code}`
          : `${room.action} ${room.old_code ?? room.new_code ?? 'room'}`);
    const parts = [
      rooms.length ? `${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'} (${shown.join(', ')}${rooms.length > 5 ? ', …' : ''})` : '',
      types ? `${types} room ${types === 1 ? 'type' : 'types'}` : '',
    ].filter(Boolean);
    return `${property?.name ?? 'your hostel'}: ${parts.join(' and ') || 'no changes'}`;
  }

  /** Best-effort email to these users' addresses; never fails the caller. */
  private emailUsers(userIds: string[], email: Omit<Parameters<typeof sendRoomChangeEmail>[1], 'to'>) {
    if (userIds.length === 0) return;
    void this.rlsDb.run({ userId: '00000000-0000-0000-0000-000000000000', role: 'service_role' }, async (_db, client) =>
      (await client.query<{ email: string }>(
        `SELECT email FROM users WHERE id = ANY($1::uuid[]) AND email IS NOT NULL AND deleted_at IS NULL`, [userIds],
      )).rows.map((row) => row.email))
      .then((to) => sendRoomChangeEmail(loadEnv(), { ...email, to }))
      .catch((err: unknown) => console.error('[room-changes] email failed:', err instanceof Error ? err.message : err));
  }
}
