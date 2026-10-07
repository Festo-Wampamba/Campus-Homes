import { timeOfDayGreeting } from "./greeting";

// Uganda is UTC+3 with no daylight saving, so these UTC instants are 08:00,
// 14:00, 20:00 and 02:00 in Kampala.
describe("timeOfDayGreeting", () => {
  it("says good morning in the morning", () => {
    expect(timeOfDayGreeting(new Date("2026-10-08T05:00:00Z"))).toBe("Good morning");
  });

  it("says good afternoon after noon", () => {
    expect(timeOfDayGreeting(new Date("2026-10-08T11:00:00Z"))).toBe("Good afternoon");
  });

  it("says good evening in the evening", () => {
    expect(timeOfDayGreeting(new Date("2026-10-08T17:00:00Z"))).toBe("Good evening");
  });

  it("says good evening after midnight", () => {
    expect(timeOfDayGreeting(new Date("2026-10-08T23:00:00Z"))).toBe("Good evening");
  });
});
