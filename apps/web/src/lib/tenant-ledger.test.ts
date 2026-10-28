import type { LandlordTenant } from "@campushomes/shared";

import { incomeSummary, percent, tenantsByRoom, tenantsCsv } from "./tenant-ledger";

const tenant = (overrides: Partial<LandlordTenant>): LandlordTenant => ({
  reservationId: "00000000-0000-4000-8000-000000000001",
  bedId: "00000000-0000-4000-8000-000000000002",
  status: "occupied",
  propertyId: "00000000-0000-4000-8000-000000000003",
  propertyName: "Mirembe",
  unitId: "00000000-0000-4000-8000-000000000004",
  roomLabel: "A01",
  bedLabel: "Bed 1",
  name: "Amina Nakato",
  phone: "+256771234567",
  email: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  totalUgx: 900_000,
  paidUgx: 300_000,
  balanceUgx: 600_000,
  ...overrides,
});

// Two open beds at 900k and one blocked bed: target counts only the open two.
const ROOMS = [{ propertyName: "Mirembe", pricePerTermUgx: 900_000, beds: [{ blocked: false }, { blocked: false }, { blocked: true }] }];

it("sets the target to every open bed at its listed rent", () => {
  expect(incomeSummary(ROOMS, []).total.targetUgx).toBe(1_800_000);
});

it("expects the rent of booked and moved-in students", () => {
  expect(incomeSummary(ROOMS, [tenant({})]).total.expectedUgx).toBe(900_000);
});

it("counts recorded payments as achieved", () => {
  expect(incomeSummary(ROOMS, [tenant({})]).total.achievedUgx).toBe(300_000);
});

it("leaves expected minus achieved as remaining", () => {
  expect(incomeSummary(ROOMS, [tenant({})]).total.remainingUgx).toBe(600_000);
});

it("shows target minus expected as the empty-bed gap", () => {
  expect(incomeSummary(ROOMS, [tenant({})]).total.emptyBedGapUgx).toBe(900_000);
});

it("splits income by property", () => {
  const other = tenant({ propertyName: "Kikoni", totalUgx: 500_000, paidUgx: 500_000, balanceUgx: 0 });
  expect(incomeSummary(ROOMS, [tenant({}), other]).byProperty.map((p) => p.propertyName)).toEqual(["Kikoni", "Mirembe"]);
});

it("has no percentage when there is nothing expected", () => {
  expect(percent(0, 0)).toBeNull();
});

it("groups students sharing a room together", () => {
  const roommate = tenant({ reservationId: "00000000-0000-4000-8000-000000000009", bedLabel: "Bed 2" });
  expect(tenantsByRoom([tenant({}), roommate])[0]?.tenants).toHaveLength(2);
});

it("stops a name from running as a spreadsheet formula", () => {
  const row = tenantsCsv([tenant({ name: "=HYPERLINK(\"x\")" })]).split("\r\n")[1];
  expect(row).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
});
