import { formatLastSeen } from "./last-seen";

// 12:00 on 16 Oct 2026 in Kampala (UTC+3).
const NOW = new Date("2026-10-16T09:00:00Z");

it("says today with the time for earlier today", () => {
  expect(formatLastSeen("2026-10-16T05:14:00Z", NOW)).toBe("last seen today at 8:14 am");
});

it("says yesterday with the time for yesterday", () => {
  expect(formatLastSeen("2026-10-15T15:02:00Z", NOW)).toBe("last seen yesterday at 6:02 pm");
});

it("gives the date for older visits", () => {
  expect(formatLastSeen("2026-10-12T09:00:00Z", NOW)).toBe("last seen 12 Oct");
});

it("adds the year for a visit in another year", () => {
  expect(formatLastSeen("2025-12-30T09:00:00Z", NOW)).toBe("last seen 30 Dec 2025");
});
