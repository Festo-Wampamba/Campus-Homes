import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  bedBlockInputSchema,
  bulkRoomInputSchema,
  rejectRoomChangeSetSchema,
  reviewRoomChangeSetSchema,
  roomTypeInputSchema,
  roomUnitInputSchema,
  submitRoomChangeSetSchema,
  unitBlockInputSchema,
  uuid,
} from '@campushomes/shared';

export class RoomManagementQueryDto extends createZodDto(z.object({
  propertyId: uuid,
  semesterId: uuid,
})) {}

export class RoomTypeInputDto extends createZodDto(roomTypeInputSchema) {}
export class RoomUnitInputDto extends createZodDto(roomUnitInputSchema) {}
export class BulkRoomInputDto extends createZodDto(bulkRoomInputSchema) {}
export class UnitBlockInputDto extends createZodDto(unitBlockInputSchema) {}
export class BedBlockInputDto extends createZodDto(bedBlockInputSchema) {}
export class SubmitRoomChangeSetDto extends createZodDto(submitRoomChangeSetSchema) {}
export class ReviewRoomChangeSetDto extends createZodDto(reviewRoomChangeSetSchema) {}
export class RejectRoomChangeSetDto extends createZodDto(rejectRoomChangeSetSchema) {}
