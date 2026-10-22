import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AmenityList, amenityIcon, amenityLabel } from "./amenity-list";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AmenityList", () => {
  it("keeps the existing icon treatment and labels unknown keys", () => {
    expect(amenityLabel("study_desk")).toBe("Study desk");
    expect(amenityLabel("solar_lantern")).toBe("Solar lantern");
    expect(amenityIcon("wifi")).not.toBe(amenityIcon("custom_feature"));
  });

  it("shows six amenities first and exposes the rest accessibly", async () => {
    const keys = ["electricity", "water_supply", "hot_water", "wifi", "laundry", "parking", "study_desk"];
    await act(async () => root.render(<AmenityList keys={keys} />));

    const list = container.querySelector("ul");
    const toggle = container.querySelector("button");
    expect(list).toBeTruthy();
    expect(list?.querySelectorAll(":scope > li")).toHaveLength(6);
    expect(container.textContent).toContain("Show all 7 amenities");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("aria-controls")).toBe(list?.id);
    expect(container.textContent).not.toContain("Study desk");

    await act(async () => toggle?.click());
    expect(list?.querySelectorAll(":scope > li")).toHaveLength(7);
    expect(container.textContent).toContain("Show fewer");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    await act(async () => toggle?.click());
    expect(list?.querySelectorAll(":scope > li")).toHaveLength(6);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  });
});
