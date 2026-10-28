import type { LandlordTenant } from "@campushomes/shared";

/** A room as the income projection needs it: its listed rent, status and beds. */
export type PricedRoom = { propertyId: string; propertyName: string; pricePerTermUgx: number; operationalStatus: string; beds: { blocked: boolean }[] };

// A blocked or under-maintenance room can't be let, so it isn't income to chase.
const UNLETTABLE = new Set(["blocked", "under_maintenance"]);

export type IncomeFigures = {
  /** Every open bed let at its listed rent: the most this semester can bring in. */
  targetUgx: number;
  /** Rent owed by booked and moved-in students, at the price they booked. */
  expectedUgx: number;
  /** Payments actually recorded against those bookings. */
  achievedUgx: number;
  /** Expected minus achieved: still to collect from current students. */
  remainingUgx: number;
  /** Target minus expected: rent lost to empty beds. */
  emptyBedGapUgx: number;
};

export type PropertyIncome = IncomeFigures & { propertyId: string; propertyName: string };

function figures(targetUgx: number, expectedUgx: number, achievedUgx: number): IncomeFigures {
  return {
    targetUgx,
    expectedUgx,
    achievedUgx,
    remainingUgx: Math.max(expectedUgx - achievedUgx, 0),
    emptyBedGapUgx: Math.max(targetUgx - expectedUgx, 0),
  };
}

/** This semester's income per property and overall, from listed rooms and recorded payments. */
export function incomeSummary(rooms: PricedRoom[], tenants: LandlordTenant[]): { total: IncomeFigures; byProperty: PropertyIncome[] } {
  // Keyed by id: two properties may share a name.
  const sums = new Map<string, { name: string; target: number; expected: number; achieved: number }>();
  const entry = (id: string, name: string) => {
    let row = sums.get(id);
    if (!row) sums.set(id, (row = { name, target: 0, expected: 0, achieved: 0 }));
    return row;
  };
  for (const room of rooms) {
    if (UNLETTABLE.has(room.operationalStatus)) continue;
    entry(room.propertyId, room.propertyName).target += room.beds.filter((bed) => !bed.blocked).length * room.pricePerTermUgx;
  }
  for (const tenant of tenants) {
    const row = entry(tenant.propertyId, tenant.propertyName);
    row.expected += tenant.totalUgx;
    row.achieved += tenant.paidUgx;
  }
  const byProperty = [...sums]
    .map(([propertyId, s]) => ({ propertyId, propertyName: s.name, ...figures(s.target, s.expected, s.achieved) }))
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName));
  const sum = (key: "targetUgx" | "expectedUgx" | "achievedUgx") => byProperty.reduce((n, p) => n + p[key], 0);
  return { total: figures(sum("targetUgx"), sum("expectedUgx"), sum("achievedUgx")), byProperty };
}

/** Whole-number percentage, or null when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export type TenantRoom = { unitId: string; roomLabel: string; propertyName: string; tenants: LandlordTenant[] };

/** Tenants grouped by the room they're in, in the API's property/room order. */
export function tenantsByRoom(tenants: LandlordTenant[]): TenantRoom[] {
  const rooms = new Map<string, TenantRoom>();
  for (const tenant of tenants) {
    const room = rooms.get(tenant.unitId) ?? { unitId: tenant.unitId, roomLabel: tenant.roomLabel, propertyName: tenant.propertyName, tenants: [] };
    room.tenants.push(tenant);
    rooms.set(tenant.unitId, room);
  }
  return [...rooms.values()];
}
