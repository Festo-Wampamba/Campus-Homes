import { rentValueForPeriod } from "./landlord-analytics";

const points = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1_000, 1_100, 1_200].map((rentValueUgx, i) => ({
  month: `M${i + 1}`,
  rentValueUgx,
}));

it("counts only the current month for the monthly view", () => {
  expect(rentValueForPeriod(points, 1)).toBe(1_200);
});

it("adds up the last three months for the quarterly view", () => {
  expect(rentValueForPeriod(points, 3)).toBe(3_300);
});

it("adds up every month for the twelve-month view", () => {
  expect(rentValueForPeriod(points, 12)).toBe(7_800);
});
