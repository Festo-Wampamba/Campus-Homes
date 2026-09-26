import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';

import type {
  BedBlockInput,
  BulkRoomInput,
  RoomTypeInput,
  RoomUnitInput,
  UnitBlockInput,
} from '@campushomes/shared';

import type { RlsContext } from '../../db/rls-context';
import { RlsDb } from '../../db/db.module';
import { AuditService } from '../ops/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

type JsonRecord = Record<string, unknown>;

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
        roomTypes,
        rooms,
      };
    });
  }

  async createRoomType(ctx: RlsContext, propertyId: string, input: RoomTypeInput) {
    const roomTypeId = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await this.assertPropertyOwner(client, propertyId, ctx.userId);
      await this.assertPhotoKeys(client, ctx.userId, input.photos);
      const changeSet = await this.getOrCreateDraft(client, propertyId, input.semesterId, ctx.userId);
      const type = await client.query<{ id: string }>(
        `INSERT INTO room_types(property_id, created_by) VALUES ($1, $2) RETURNING id`,
        [propertyId, ctx.userId],
      );
      const id = type.rows[0]!.id;
      const versionId = await this.insertVersion(client, id, changeSet.id, 1, ctx.userId, input);
      await this.replacePhotos(client, versionId, ctx.userId, input.photos);
      return id;
    });
    await this.audit.record(ctx, 'room_type.draft_create', 'room_type', roomTypeId, { propertyId });
    return this.roomType(ctx, roomTypeId);
  }

  async updateRoomType(ctx: RlsContext, roomTypeId: string, input: RoomTypeInput) {
    await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const type = await this.assertRoomTypeOwner(client, roomTypeId, ctx.userId);
      await this.assertPhotoKeys(client, ctx.userId, input.photos, roomTypeId);
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
      return created.rows[0]!.id;
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
      return ids;
    });
    await this.audit.record(ctx, 'room.bulk_draft_create', 'property', propertyId, { count: changeIds.length });
    const overview = await this.overviewForProperty(ctx, propertyId);
    return overview.rooms.filter((room: { id: string }) => changeIds.includes(room.id));
  }

  async updateRoom(ctx: RlsContext, roomOrChangeId: string, input: RoomUnitInput) {
    const propertyId = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
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
    });
    await this.audit.record(ctx, 'room.draft_update', 'unit', roomOrChangeId, {});
    return this.pendingRoom(ctx, propertyId, roomOrChangeId);
  }

  async archiveRoom(ctx: RlsContext, unitId: string) {
    const propertyId = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      const unit = await this.assertUnitOwner(client, unitId, ctx.userId);
      const live = await client.query(
        `SELECT 1 FROM reservations r JOIN beds b ON b.id=r.bed_id
         WHERE b.unit_id=$1 AND r.status IN ('reserved','booked','occupied') LIMIT 1`, [unitId],
      );
      if (live.rows.length) throw new ConflictException('A room with a live reservation cannot be archived');
      const semester = await client.query<{ semester_id: string }>(
        `SELECT semester_id FROM unit_semester_pricing WHERE unit_id=$1 ORDER BY created_at DESC LIMIT 1`, [unitId],
      );
      if (!semester.rows[0]) throw new BadRequestException('Room has no semester pricing');
      const changeSet = await this.getOrCreateDraft(client, unit.property_id, semester.rows[0].semester_id, ctx.userId);
      await client.query(
        `INSERT INTO room_unit_changes(change_set_id, action, unit_id, room_type_id, proposed_data, created_by)
         VALUES ($1,'archive',$2,$3,'{}'::jsonb,$4)`,
        [changeSet.id, unitId, unit.room_type_id, ctx.userId],
      );
      return unit.property_id;
    });
    await this.audit.record(ctx, 'room.archive_request', 'unit', unitId, { propertyId });
    return { staged: true };
  }

  async blockRoom(ctx: RlsContext, unitId: string, input: UnitBlockInput) {
    const block = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await this.assertUnitOwner(client, unitId, ctx.userId);
      try {
        const inserted = await client.query<{
          id: string; unit_id: string; reason: string; starts_at: Date; ends_at: Date | null;
          notes: string | null; created_by: string; cleared_at: Date | null; created_at: Date;
        }>(
          `INSERT INTO unit_blocks(unit_id, reason, starts_at, ends_at, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [unitId, input.reason, input.startsAt, input.endsAt ?? null, input.notes ?? null, ctx.userId],
        );
        return inserted.rows[0]!;
      } catch (error) {
        if ((error as { code?: string }).code === '23P01') {
          throw new ConflictException('This room already has an overlapping active block');
        }
        throw error;
      }
    });
    await this.audit.record(ctx, 'room.block', 'unit', unitId, { reason: input.reason, startsAt: input.startsAt, endsAt: input.endsAt });
    return this.mapBlock(block);
  }

  async clearBlock(ctx: RlsContext, unitId: string, blockId: string) {
    await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await this.assertUnitOwner(client, unitId, ctx.userId);
      const result = await client.query(
        `UPDATE unit_blocks SET cleared_at=now(), cleared_by=$3
         WHERE id=$1 AND unit_id=$2 AND cleared_at IS NULL RETURNING id`,
        [blockId, unitId, ctx.userId],
      );
      if (!result.rows.length) throw new NotFoundException('Active room block not found');
    });
    await this.audit.record(ctx, 'room.unblock', 'unit', unitId, { blockId });
    return { cleared: true };
  }

  async blockBed(ctx: RlsContext, unitId: string, bedId: string, input: BedBlockInput) {
    const result = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
      await this.assertUnitOwner(client, unitId, ctx.userId);
      const live = await client.query(
        `SELECT 1 FROM reservations WHERE bed_id=$1 AND status IN ('reserved','booked','occupied') LIMIT 1`, [bedId],
      );
      if (input.blocked && live.rows.length) throw new ConflictException('An occupied or reserved bed cannot be blocked');
      const updated = await client.query(
        `UPDATE beds SET blocked=$3, blocked_reason=$4 WHERE id=$1 AND unit_id=$2 AND retired_at IS NULL RETURNING id`,
        [bedId, unitId, input.blocked, input.blocked ? input.reason ?? 'Blocked by landlord' : null],
      );
      if (!updated.rows.length) throw new NotFoundException('Bedspace not found');
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
      const requiresVisit = await client.query(
        `SELECT 1 FROM room_unit_changes WHERE change_set_id=$1 AND action IN ('create','capacity_change') LIMIT 1`,
        [changeSetId],
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
      return { row: updated.rows[0]!, counts, propertyId: row.property_id };
    });
    await this.audit.record(ctx, 'room_change_set.submit', 'room_inventory_change_set', changeSetId, result.counts);
    await this.notifyReviewers(changeSetId, result.propertyId);
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
         WHERE cs.status IN ('pending_review','visit_required') ORDER BY cs.submitted_at`,
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

      const versions = await client.query<RoomTypeVersionRow>(
        `SELECT * FROM room_type_versions WHERE change_set_id=$1 ORDER BY version_number`, [changeSetId],
      );
      for (const version of versions.rows) {
        await this.applyRoomTypeVersion(client, version, row.semester_id, ctx.userId, notes ?? null);
      }
      const changes = await client.query<{ id: string; action: string; unit_id: string | null; room_type_id: string | null; proposed_data: JsonRecord }>(
        `SELECT * FROM room_unit_changes WHERE change_set_id=$1 ORDER BY created_at`, [changeSetId],
      );
      for (const change of changes.rows) await this.applyUnitChange(client, change, row.semester_id);

      await client.query(
        `UPDATE room_inventory_change_sets SET status='approved', reviewed_by=$2, reviewed_at=now(),
           reviewer_notes=$3, rejection_reason=NULL, updated_at=now() WHERE id=$1`,
        [changeSetId, ctx.userId, notes ?? null],
      );
      return { landlordId: row.landlord_id, propertyId: row.property_id };
    });
    await this.audit.record(ctx, 'room_change_set.approve', 'room_inventory_change_set', changeSetId, { notes });
    await this.notifications.notify(result.landlordId, 'room_changes.approved', 'in_app', {
      message: 'Your room inventory changes were approved and are now live.',
      href: `/landlord/rooms?propertyId=${result.propertyId}`,
    });
    return { approved: true };
  }

  async rejectChangeSet(ctx: RlsContext, changeSetId: string, reason: string) {
    const result = await this.rlsDb.run({ ...ctx, role: 'service_role' }, async (_db, client) => {
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
      message: `Your room inventory changes need revision: ${reason}`,
      href: `/landlord/rooms?propertyId=${result.property_id}`,
    });
    return { rejected: true };
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
    const result = await client.query<{ id: string; property_id: string; room_type_id: string }>(
      `SELECT u.id, u.property_id, u.room_type_id FROM units u JOIN properties p ON p.id=u.property_id
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
      .filter((key) => !key.startsWith(`uploads/${userId}/`));
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
    const output = [];
    for (const type of types.rows) {
      const current = type.current_version_id
        ? (await client.query<RoomTypeVersionRow>(`SELECT * FROM room_type_versions WHERE id=$1`, [type.current_version_id])).rows[0] ?? null
        : null;
      const pending = changeSetId
        ? (await client.query<RoomTypeVersionRow>(
          `SELECT * FROM room_type_versions WHERE room_type_id=$1 AND change_set_id=$2 ORDER BY version_number DESC LIMIT 1`,
          [type.id, changeSetId],
        )).rows[0] ?? null
        : null;
      output.push({
        id: type.id, propertyId: type.property_id, currentVersionId: type.current_version_id,
        currentVersion: current ? await this.mapVersion(client, current) : null,
        pendingVersion: pending ? await this.mapVersion(client, pending) : null,
        attachedRoomsCount: Number(type.attached_count), createdAt: type.created_at.toISOString(),
      });
    }
    return output;
  }

  private async mapVersion(client: PoolClient, row: RoomTypeVersionRow) {
    const photos = await client.query<{ id: string; storage_key: string; sort_order: number; is_primary: boolean; uploaded_by: string; created_at: Date }>(
      `SELECT * FROM room_type_photos WHERE room_type_version_id=$1 ORDER BY sort_order`, [row.id],
    );
    return {
      id: row.id, roomTypeId: row.room_type_id, versionNumber: Number(row.version_number), title: row.title,
      category: row.category, bathroomType: row.bathroom_type, capacity: Number(row.capacity), sizeSqm: row.size_sqm,
      description: row.description, amenities: row.amenities ?? [], semesterId: row.semester_id,
      pricePerTermUgx: Number(row.price_per_term_ugx), depositUgx: row.deposit_ugx === null ? null : Number(row.deposit_ugx),
      status: row.status, rejectionReason: row.rejection_reason, reviewerNotes: row.reviewer_notes,
      submittedAt: row.submitted_at?.toISOString() ?? null, reviewedAt: row.reviewed_at?.toISOString() ?? null,
      photos: photos.rows.map((photo) => ({ id: photo.id, storageKey: photo.storage_key,
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
      type_title: string; pending: boolean;
    }>(
      `SELECT u.id,u.property_id,u.room_type_id,u.label,u.capacity,u.room_category::text,u.building_name,u.floor_label,
        u.operational_status, COALESCE(cv.title, initcap(replace(u.room_category::text,'_',' ')) || ' Room') type_title,
        EXISTS(SELECT 1 FROM room_unit_changes c JOIN room_inventory_change_sets cs ON cs.id=c.change_set_id
               WHERE c.unit_id=u.id AND cs.status IN ('draft','pending_review','visit_required','rejected')) pending
       FROM units u JOIN room_types rt ON rt.id=u.room_type_id
       LEFT JOIN room_type_versions cv ON cv.id=rt.current_version_id
       WHERE u.property_id=$1 AND u.archived_at IS NULL ORDER BY u.building_name NULLS FIRST,u.floor_label NULLS FIRST,u.label`, [propertyId],
    );
    const output = [];
    for (const unit of units.rows) {
      const mapped = await this.mapUnit(client, unit);
      if (changeSetId) {
        const pending = await client.query<{ room_type_id: string; proposed_data: JsonRecord }>(
          `SELECT room_type_id,proposed_data FROM room_unit_changes
           WHERE change_set_id=$1 AND unit_id=$2 AND action='update' ORDER BY created_at DESC LIMIT 1`,
          [changeSetId, unit.id],
        );
        if (pending.rows[0]) {
          const data = pending.rows[0].proposed_data;
          const spec = await client.query<{ title: string; category: string; capacity: number }>(
            `SELECT title,category,capacity FROM room_type_versions WHERE room_type_id=$1
             ORDER BY CASE WHEN status IN ('draft','rejected','pending_review','visit_required') THEN 0 ELSE 1 END,
             version_number DESC LIMIT 1`, [pending.rows[0].room_type_id],
          );
          Object.assign(mapped, {
            roomTypeId: pending.rows[0].room_type_id,
            roomTypeTitle: spec.rows[0]?.title ?? mapped.roomTypeTitle,
            roomCategory: spec.rows[0]?.category ?? mapped.roomCategory,
            roomCode: data.roomCode ?? mapped.roomCode,
            buildingName: data.buildingName ?? null,
            floorLabel: data.floorLabel ?? null,
            capacity: Number(spec.rows[0]?.capacity ?? mapped.capacity),
            pendingChanges: true,
          });
        }
      }
      output.push(mapped);
    }

    if (changeSetId) {
      const proposed = await client.query<{ id: string; room_type_id: string; proposed_data: JsonRecord }>(
        `SELECT id, room_type_id, proposed_data FROM room_unit_changes
         WHERE change_set_id=$1 AND action='create' ORDER BY created_at`, [changeSetId],
      );
      for (const change of proposed.rows) {
        const data = change.proposed_data;
        const spec = await client.query<{ title: string; category: string; capacity: number }>(
          `SELECT title,category,capacity FROM room_type_versions WHERE room_type_id=$1
           ORDER BY CASE WHEN status IN ('draft','rejected','pending_review','visit_required') THEN 0 ELSE 1 END,
           version_number DESC LIMIT 1`, [change.room_type_id],
        );
        const capacity = Number(data.capacity ?? spec.rows[0]?.capacity ?? 1);
        output.push({
          id: change.id, propertyId, roomTypeId: change.room_type_id,
          roomTypeTitle: spec.rows[0]?.title ?? 'Room', roomCategory: spec.rows[0]?.category ?? 'other',
          roomCode: String(data.roomCode ?? ''), buildingName: data.buildingName ?? null, floorLabel: data.floorLabel ?? null,
          capacity, totalBeds: capacity, occupiedBeds: 0, derivedStatus: 'available', activeBlock: null,
          pendingChanges: true,
          beds: Array.from({ length: capacity }, (_, index) => ({ id: `${change.id}-bed-${index + 1}`,
            unitId: change.id, label: `Bed ${index + 1}`, blocked: false, status: 'available' })),
        });
      }
    }
    return output;
  }

  private async mapUnit(client: PoolClient, unit: {
    id: string; property_id: string; room_type_id: string; label: string; capacity: number; room_category: string;
    building_name: string | null; floor_label: string | null; operational_status: string; type_title: string; pending: boolean;
  }) {
    const beds = await client.query<{
      id: string; label: string; blocked: boolean; blocked_reason: string | null; reservation_id: string | null;
      status: string | null; reserved_expires_at: Date | null; booked_at: Date | null; student_name: string | null; student_phone: string | null;
    }>(
      `SELECT b.id,b.label,b.blocked,b.blocked_reason,r.id reservation_id,r.status::text,r.reserved_expires_at,r.booked_at,
        su.name student_name,su.phone student_phone
       FROM beds b LEFT JOIN LATERAL (
         SELECT * FROM reservations r WHERE r.bed_id=b.id AND r.status IN ('reserved','booked','occupied')
         ORDER BY r.created_at DESC LIMIT 1
       ) r ON true LEFT JOIN users su ON su.id=r.student_id
       WHERE b.unit_id=$1 AND b.retired_at IS NULL ORDER BY b.label`, [unit.id],
    );
    const block = await client.query<{
      id: string; unit_id: string; reason: string; starts_at: Date; ends_at: Date | null; notes: string | null;
      created_by: string; cleared_at: Date | null; created_at: Date;
    }>(
      `SELECT * FROM unit_blocks WHERE unit_id=$1 AND cleared_at IS NULL AND starts_at<=now()
       AND (ends_at IS NULL OR ends_at>now()) ORDER BY starts_at DESC LIMIT 1`, [unit.id],
    );
    const mappedBeds = beds.rows.map((bed) => ({
      id: bed.id, unitId: unit.id, label: bed.label, blocked: bed.blocked, blockedReason: bed.blocked_reason,
      status: bed.blocked ? 'blocked' : bed.status ?? 'available', studentName: bed.student_name,
      studentPhone: bed.student_phone, reservationId: bed.reservation_id,
      reservedExpiresAt: bed.reserved_expires_at?.toISOString() ?? null, bookedAt: bed.booked_at?.toISOString() ?? null,
    }));
    const occupiedBeds = mappedBeds.filter((bed) => ['reserved','booked','occupied'].includes(bed.status)).length;
    const activeBeds = mappedBeds.filter((bed) => !bed.blocked);
    const activeBlock = block.rows[0] ? this.mapBlock(block.rows[0]) : null;
    const derivedStatus = activeBlock || unit.operational_status === 'blocked' || unit.operational_status === 'under_maintenance'
      ? 'blocked'
      : activeBeds.length === 0 ? 'blocked'
      : occupiedBeds === 0 ? 'available'
      : occupiedBeds >= activeBeds.length ? 'fully_occupied' : 'partially_occupied';
    return {
      id: unit.id, propertyId: unit.property_id, roomTypeId: unit.room_type_id, roomTypeTitle: unit.type_title,
      roomCategory: unit.room_category, roomCode: unit.label, buildingName: unit.building_name, floorLabel: unit.floor_label,
      capacity: Number(unit.capacity), totalBeds: mappedBeds.length, occupiedBeds, derivedStatus, activeBlock,
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

  private async applyUnitChange(client: PoolClient, change: {
    id: string; action: string; unit_id: string | null; room_type_id: string | null; proposed_data: JsonRecord;
  }, semesterId: string) {
    if (change.action === 'archive' && change.unit_id) {
      const live = await client.query(`SELECT 1 FROM reservations r JOIN beds b ON b.id=r.bed_id
        WHERE b.unit_id=$1 AND r.status IN ('reserved','booked','occupied') LIMIT 1`, [change.unit_id]);
      if (live.rows.length) throw new ConflictException('A room gained a live reservation and can no longer be archived');
      await client.query(`UPDATE units SET archived_at=now(),operational_status='blocked' WHERE id=$1`, [change.unit_id]);
      return;
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
      return;
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

  private async notifyReviewers(changeSetId: string, propertyId: string) {
    const reviewers = await this.rlsDb.run({ userId: '00000000-0000-0000-0000-000000000000', role: 'service_role' }, async (_db, client) => {
      const result = await client.query<{ user_id: string; role_key: string }>(
        `SELECT DISTINCT ON (ura.user_id) ura.user_id, r.key role_key FROM user_role_assignments ura JOIN roles r ON r.id=ura.role_id
         JOIN users u ON u.id=ura.user_id WHERE r.key IN ('super_admin','platform_admin','ops_lead')
           AND ura.revoked_at IS NULL AND (ura.valid_until IS NULL OR ura.valid_until>now())
           AND u.status='active' AND u.deleted_at IS NULL
         ORDER BY ura.user_id, CASE WHEN r.key IN ('super_admin','platform_admin') THEN 0 ELSE 1 END`,
      );
      return result.rows;
    });
    await Promise.all(reviewers.map((reviewer) => this.notifications.notify(reviewer.user_id, 'room_changes.submitted', 'in_app', {
      message: 'A landlord submitted room inventory changes for review.',
      href: reviewer.role_key === 'ops_lead' ? '/ops/room-changes' : '/admin/room-changes',
      propertyId,
      changeSetId,
    })));
  }
}
