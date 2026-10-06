import { POLL_MS, SLOW_POLL_MS, isFinal, pollDelay } from "./approval-status";

describe("pollDelay", () => {
  it("polls every 5 seconds while healthy", () => {
    expect(pollDelay(0)).toBe(POLL_MS);
  });

  it("keeps 5 seconds after two failures", () => {
    expect(pollDelay(2)).toBe(POLL_MS);
  });

  it("slows to 15 seconds after three consecutive failures", () => {
    expect(pollDelay(3)).toBe(SLOW_POLL_MS);
  });
});

describe("isFinal", () => {
  it.each([
    ["pending", false],
    ["verified", true],
    ["rejected", true],
  ] as const)("%s is final: %s", (status, expected) => {
    expect(isFinal(status)).toBe(expected);
  });
});
