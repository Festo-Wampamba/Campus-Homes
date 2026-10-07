import { to24Hour } from "./schedule-visit-form";

describe("to24Hour", () => {
  it("keeps morning hours as they are", () => {
    expect(to24Hour("9", "15", "AM")).toBe("09:15");
  });

  it("adds twelve hours in the afternoon", () => {
    expect(to24Hour("3", "05", "PM")).toBe("15:05");
  });

  it("treats 12 PM as noon", () => {
    expect(to24Hour("12", "00", "PM")).toBe("12:00");
  });

  it("treats 12 AM as midnight", () => {
    expect(to24Hour("12", "30", "AM")).toBe("00:30");
  });

  it("is empty until an hour is picked", () => {
    expect(to24Hour("", "00", "AM")).toBe("");
  });
});
