import { renderToStaticMarkup } from "react-dom/server";

import StudentDashboardPage from "./page";

const ROW = { propertyName: "Hunter Hostel", roomCategory: "single", bedLabel: "Bed 1", bookingRequestedAt: null };

jest.mock("../../../lib/session", () => ({
  getServerSession: () => Promise.resolve({ user: { name: "Kato Samuel" } }),
}));
jest.mock("../../../lib/saved-listings", () => ({ getSavedListings: () => Promise.resolve([{}, {}]) }));
jest.mock("../../../lib/reservations", () => ({
  getMyReservations: () =>
    Promise.resolve([
      { ...ROW, id: "aaaaaaaa-0000-4000-8000-000000000001", status: "reserved", reservedExpiresAt: "2026-10-16T07:23:00.000Z" },
      { ...ROW, id: "bbbbbbbb-0000-4000-8000-000000000002", status: "booked", reservedExpiresAt: null },
      { ...ROW, id: "cccccccc-0000-4000-8000-000000000003", status: "cancelled", reservedExpiresAt: null },
    ]),
}));

it("counts only live reservations against the limit", async () => {
  const html = renderToStaticMarkup(await StudentDashboardPage());

  expect(html).toContain("2 of 5 active");
});

it("lists a confirmed booking under My bookings with its status", async () => {
  const html = renderToStaticMarkup(await StudentDashboardPage());

  expect(html).toContain("Confirmed · move in next");
});

it("links each booking to its tracker", async () => {
  const html = renderToStaticMarkup(await StudentDashboardPage());

  expect(html).toContain('href="/reservations?track=bbbbbbbb-0000-4000-8000-000000000002"');
});
