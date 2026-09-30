import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { AuthGuard } from '../auth/auth.guard';
import { PERMISSION_KEY, PermissionsGuard } from '../auth/permissions';
import { RolesGuard } from '../auth/roles';
import { RoomManagementOpsController } from '../room-management/room-management.controller';
import { OpsController } from './ops.controller';

type Controller = typeof OpsController | typeof RoomManagementOpsController;

// The permission matrix, not @Roles, decides who may use each ops route. A new
// route must be added here, which forces a deliberate choice of key.
const ROUTE_PERMISSIONS: [Controller, string, string][] = [
  [OpsController, 'queue', 'visits.read'],
  [OpsController, 'listInspectors', 'visits.assign'],
  [OpsController, 'myVisits', 'visits.inspect'],
  [OpsController, 'myVisitHistory', 'visits.inspect'],
  [OpsController, 'visitDetail', 'visits.read'],
  [OpsController, 'propertyListings', 'listings.read'],
  [OpsController, 'listingForPublish', 'listings.read'],
  [OpsController, 'addListingPhotos', 'listings.publish'],
  [OpsController, 'publishableSemesters', 'listings.read'],
  [OpsController, 'propertyRooms', 'listings.read'],
  [OpsController, 'createDraftListing', 'listings.publish'],
  [OpsController, 'scheduleVisit', 'visits.assign'],
  [OpsController, 'syncVisit', 'visits.inspect'],
  [OpsController, 'updateUnitOperationalStatus', 'units.update_operational_status'],
  [OpsController, 'approveVisit', 'visits.review'],
  [OpsController, 'raiseVisitCorrection', 'visits.review'],
  [OpsController, 'resolveVisitCorrection', 'visits.inspect'],
  [OpsController, 'publishListing', 'listings.publish'],
  [OpsController, 'setCampusPhoto', 'campus_photos.manage'],
  [OpsController, 'issueStrike', 'strikes.issue'],
  [OpsController, 'leadsQueue', 'onboarding_leads.manage'],
  [OpsController, 'updateLeadStatus', 'onboarding_leads.manage'],
  [OpsController, 'inviteLandlord', 'landlords.invite'],
  [OpsController, 'kycQueue', 'landlords.review_kyc'],
  [OpsController, 'decideKyc', 'landlords.review_kyc'],
  [RoomManagementOpsController, 'queue', 'room_changes.review'],
  [RoomManagementOpsController, 'approve', 'room_changes.review'],
  [RoomManagementOpsController, 'reject', 'room_changes.review'],
];

function routeHandlers(controller: Controller): string[] {
  const prototype = controller.prototype as unknown as Record<string, object>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor' && Reflect.hasMetadata(PATH_METADATA, prototype[name]!));
}

describe.each([OpsController, RoomManagementOpsController])('%p', (controller) => {
  it('lists every route handler in the permission table', () => {
    const listed = ROUTE_PERMISSIONS.filter(([owner]) => owner === controller).map(([, handler]) => handler);
    expect(routeHandlers(controller).sort()).toEqual(listed.sort());
  });

  it('runs the permission check before the role check that fixes the RLS role', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([AuthGuard, PermissionsGuard, RolesGuard]);
  });
});

it.each(ROUTE_PERMISSIONS)('%p.%s requires %s', (controller, handler, permission) => {
  const prototype = controller.prototype as unknown as Record<string, object>;
  expect(Reflect.getMetadata(PERMISSION_KEY, prototype[handler]!)).toBe(permission);
});
