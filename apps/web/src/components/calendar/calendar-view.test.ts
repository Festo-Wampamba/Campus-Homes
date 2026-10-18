import { localDateKey, startsIn } from "./calendar-view";

describe("localDateKey", () => {
  it("keeps a local evening on its own day, not the UTC one", () => {
    expect(localDateKey(new Date(2026, 9, 18, 23, 30))).toBe("2026-10-18");
  });
});

describe("startsIn", () => {
  const now = Date.parse("2026-10-18T09:00:00Z");
  it("counts minutes for an event within the hour", () => {
    expect(startsIn("2026-10-18T09:25:00Z", now)).toBe("in 25 min");
  });
  it("counts hours for an event later today", () => {
    expect(startsIn("2026-10-18T12:00:00Z", now)).toBe("in 3 h");
  });
  it("says nothing for an event more than a day away", () => {
    expect(startsIn("2026-10-20T09:00:00Z", now)).toBeNull();
  });
});
