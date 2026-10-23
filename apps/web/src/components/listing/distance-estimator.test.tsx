import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DistanceEstimator } from "./distance-estimator";

jest.mock("next/dynamic", () => () => () => null);

const OTHER_HOSTEL = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Other published hostel",
  gps_lat: 0.35,
  gps_lon: 32.57,
};
const mockQuery = {
  data: { pages: [{ items: [OTHER_HOSTEL], page: 1, pageSize: 20, total: 1, hasMore: false }] },
  hasNextPage: false,
  isError: false,
  isFetchingNextPage: false,
  isPending: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
};

jest.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => mockQuery,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <DistanceEstimator
      currentHostel={{ id: "11111111-1111-4111-8111-111111111111", name: "Current hostel", lat: 0.3, lon: 32.5 }}
    />,
  ));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("DistanceEstimator", () => {
  it("shows a straight-line result and keeps the comparison map opt-in", async () => {
    expect(container.textContent).toContain("Straight-line (shortcut) distance");
    expect(container.textContent).toContain("km");
    expect(container.textContent).toContain("m)");
    expect(container.querySelector("#distance-comparison-map")).toBeNull();

    const showMap = [...container.querySelectorAll("button")].find((button) => button.textContent === "Show comparison map");
    expect(showMap).toBeTruthy();
    await act(async () => showMap?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector("#distance-comparison-map")).toBeTruthy();
  });

  it("lets the user choose another published hostel and prevents the same pair", async () => {
    const destinationType = container.querySelector("#distance-destination-kind") as HTMLSelectElement;
    destinationType.value = "hostel";
    await act(async () => destinationType.dispatchEvent(new Event("change", { bubbles: true })));

    const destination = container.querySelector("#distance-hostel") as HTMLSelectElement;
    destination.value = OTHER_HOSTEL.id;
    await act(async () => destination.dispatchEvent(new Event("change", { bubbles: true })));

    expect(container.textContent).toContain("Other published hostel");
    expect(container.textContent).toContain("Straight-line (shortcut) distance");
    const originOption = container.querySelector(`#distance-origin option[value="${OTHER_HOSTEL.id}"]`) as HTMLOptionElement;
    expect(originOption.disabled).toBe(true);
  });
});
