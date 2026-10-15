import { renderToStaticMarkup } from "react-dom/server";

import StudentDashboardPage from "./page";

jest.mock("../../../lib/session", () => ({
  getServerSession: () => Promise.resolve({ user: { name: "Kato Samuel" } }),
}));
jest.mock("../../../lib/saved-listings", () => ({ getSavedListings: () => Promise.resolve([{}, {}]) }));
jest.mock("../../../lib/reservations", () => ({
  getMyReservations: () =>
    Promise.resolve([
      { status: "reserved", reservedExpiresAt: "2026-10-16T07:23:00.000Z" },
      { status: "booked", reservedExpiresAt: null },
      { status: "cancelled", reservedExpiresAt: null },
    ]),
}));

it("counts only live reservations against the limit", async () => {
  const html = renderToStaticMarkup(await StudentDashboardPage());

  expect(html).toContain("2 of 5 active");
});
