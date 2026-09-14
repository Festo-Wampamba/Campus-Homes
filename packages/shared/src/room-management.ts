import { z } from 'zod';

import { idempotencyKey, ugxAmount, uuid } from './common.js';
import { ROOM_CATEGORIES } from './enums.js';

export const BATHROOM_TYPES = ['ensuite', 'shared', 'private_external', 'unspecified'] as const;
export const UNIT_BLOCK_REASONS = [
  'maintenance',
  'renovation',
  'damaged_utilities',
  'offline_allocation',
  'safety',
  'owner_hold',
  'other',
] as const;

const nullableText = z.string().trim().max(1000).nullable().optional();

export const roomTypePhotoInputSchema = z.object({
  storageKey: z.string().trim().min(1).max(500),
  sortOrder: z.number().int().min(0).max(9),
  isPrimary: z.boolean(),
});

export const roomTypeInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum(ROOM_CATEGORIES),
  bathroomType: z.enum(BATHROOM_TYPES),
  capacity: z.number().int().min(1).max(20),
  sizeSqm: z.number().int().positive().max(1000).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  amenities: z.array(z.string().trim().min(1).max(80)).max(50),
  semesterId: uuid,
  pricePerTermUgx: ugxAmount,
  depositUgx: z.number().int().min(0).nullable().optional(),
  photos: z.array(roomTypePhotoInputSchema).max(10),
}).superRefine((value, ctx) => {
  const fixedCapacity: Partial<Record<(typeof ROOM_CATEGORIES)[number], number>> = {
    single: 1,
    double: 2,
    triple: 3,
    quad: 4,
  };
  const expected = fixedCapacity[value.category];
  if (expected && value.capacity !== expected) {
    ctx.addIssue({ code: 'custom', path: ['capacity'], message: `${value.category} rooms must have capacity ${expected}` });
  }
  if (value.photos.filter((photo) => photo.isPrimary).length > 1) {
    ctx.addIssue({ code: 'custom', path: ['photos'], message: 'Only one primary photo is allowed' });
  }
});
export type RoomTypeInput = z.infer<typeof roomTypeInputSchema>;

export const roomUnitInputSchema = z.object({
  roomCode: z.string().trim().min(1).max(100),
  roomTypeId: uuid,
  buildingName: z.string().trim().max(120).nullable().optional(),
  floorLabel: z.string().trim().max(80).nullable().optional(),
});
export type RoomUnitInput = z.infer<typeof roomUnitInputSchema>;

export const bulkRoomInputSchema = z.object({
  roomTypeId: uuid,
  buildingName: z.string().trim().max(120).nullable().optional(),
  floorLabel: z.string().trim().max(80).nullable().optional(),
  roomCodes: z.array(z.string().trim().min(1).max(100)).min(1).max(200),
  idempotencyKey,
});
export type BulkRoomInput = z.infer<typeof bulkRoomInputSchema>;

export const unitBlockInputSchema = z.object({
  reason: z.enum(UNIT_BLOCK_REASONS),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable().optional(),
  notes: nullableText,
}).refine((value) => !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt), {
  path: ['endsAt'],
  message: 'End time must be after start time',
});
export type UnitBlockInput = z.infer<typeof unitBlockInputSchema>;

export const submitRoomChangeSetSchema = z.object({
  notes: nullableText,
});

export const reviewRoomChangeSetSchema = z.object({
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const rejectRoomChangeSetSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});

export const bedBlockInputSchema = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().max(500).nullable().optional(),
});
export type BedBlockInput = z.infer<typeof bedBlockInputSchema>;

export interface RoomChangeReviewItem {
  id: string;
  propertyId: string;
  semesterId: string;
  status: 'pending_review' | 'visit_required';
  propertyName: string;
  landlordName: string;
  submittedAt: string | null;
  submissionNotes: string | null;
  physicalRoomChangesCount: number;
  roomTypeChangesCount: number;
  roomTypeChanges: Array<{
    id: string;
    before: { title: string; category: string; capacity: number; pricePerTermUgx: number } | null;
    after: { title: string; category: string; capacity: number; pricePerTermUgx: number };
  }>;
  physicalRoomChanges: Array<{
    id: string;
    action: 'create' | 'update' | 'archive' | 'capacity_change';
    before: { roomCode: string; buildingName: string | null; floorLabel: string | null; capacity: number } | null;
    after: { roomCode: string; buildingName: string | null; floorLabel: string | null; capacity: number } | null;
  }>;
}
