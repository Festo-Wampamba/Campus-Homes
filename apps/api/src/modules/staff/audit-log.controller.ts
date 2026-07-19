import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { desc } from 'drizzle-orm';

import { RlsDb } from '../../db/db.module';
import { auditLog } from '../../db/schema';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';

@Controller('admin/audit-log')
@UseGuards(AuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly rlsDb: RlsDb) {}

  @Get()
  @RequirePermission('audit.read')
  list(@Req() req: PermissionedRequest) {
    // The actor's own ctx, not service_role: audit_log_lead_read (0001)
    // already scopes reads to app_is_lead() at the RLS layer — this
    // endpoint's PermissionsGuard check is the primary gate, RLS the backstop.
    return this.rlsDb.run(rlsCtx(req), (db) =>
      db.select().from(auditLog).orderBy(desc(auditLog.ts)).limit(100),
    );
  }
}
