import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OpsModule } from '../ops/ops.module';
import { RoomManagementController, RoomManagementOpsController } from './room-management.controller';
import { RoomManagementService } from './room-management.service';

@Module({
  imports: [AuthModule, NotificationsModule, OpsModule],
  controllers: [RoomManagementController, RoomManagementOpsController],
  providers: [RoomManagementService],
  exports: [RoomManagementService],
})
export class RoomManagementModule {}
