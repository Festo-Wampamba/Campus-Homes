import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RoomCategoryList } from "./room-category-list";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const UNIT = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "D1",
  capacity: 2,
  roomCategory: "double" as const,
  selfContained: false,
  pricePerTermUgx: 900_000,
  depositUgx: null,
};
const BED_A = "22222222-2222-4222-8222-222222222222";
const BED_B = "33333333-3333-4333-8333-333333333333";

let container: HTMLDivElement;
let root: Root;

async function render(availability: { id: string; unit_id: string; available: boolean }[], units = [UNIT]) {
  await act(async () =>
    root.render(
      <RoomCategoryList
        listingId="listing-1"
        units={units}
        availability={availability}
        photos={[]}
        unitPhotos={[]}
        propertyName="Kikoni Rise"
        canReserve={false}
        needsProfile={false}
      />,
    ),
  );
}

async function renderForStudent(myLiveBeds: Map<string, "reserved" | "booked">, units = [UNIT]) {
  await act(async () =>
    root.render(
      <RoomCategoryList
        listingId="listing-1"
        units={units}
        availability={[
          { id: BED_A, unit_id: UNIT.id, available: true },
          { id: BED_B, unit_id: UNIT.id, available: false },
        ]}
        photos={[]}
        unitPhotos={[]}
        propertyName="Kikoni Rise"
        canReserve
        needsProfile={false}
        myLiveBeds={myLiveBeds}
      />,
    ),
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("RoomCategoryList", () => {
  it("shows only free beds, never other students' holds", async () => {
    await render([
      { id: BED_A, unit_id: UNIT.id, available: true },
      { id: BED_B, unit_id: UNIT.id, available: false },
    ]);

    expect(container.textContent).not.toMatch(/reserved/i);
  });

  it("says no beds are free when none are", async () => {
    await render([
      { id: BED_A, unit_id: UNIT.id, available: false },
      { id: BED_B, unit_id: UNIT.id, available: false },
    ]);

    expect(container.textContent).toContain("No beds free right now");
  });

  it("counts only rooms that still have a free bed", async () => {
    const fullRoom = { ...UNIT, id: "44444444-4444-4444-8444-444444444444", label: "D2" };
    await render(
      [
        { id: BED_A, unit_id: UNIT.id, available: true },
        { id: BED_B, unit_id: UNIT.id, available: false },
        { id: "55555555-5555-4555-8555-555555555555", unit_id: fullRoom.id, available: false },
        { id: "66666666-6666-4666-8666-666666666666", unit_id: fullRoom.id, available: false },
      ],
      [UNIT, fullRoom],
    );

    expect(container.textContent).toContain("1 room free");
  });

  it("drops the room count when every room is taken", async () => {
    await render([
      { id: BED_A, unit_id: UNIT.id, available: false },
      { id: BED_B, unit_id: UNIT.id, available: false },
    ]);

    expect(container.textContent).not.toMatch(/\broom/);
  });

  it("shows Reserved instead of Reserve on a room type the student already holds", async () => {
    await renderForStudent(new Map([[BED_B, "reserved"]]));

    const labels = [...container.querySelectorAll("a, button")].map((el) => el.textContent?.trim());
    expect(labels).toEqual(["Reserved"]);
  });

  it("shows Reserved on every price row of a held room type", async () => {
    const pricier = { ...UNIT, id: "44444444-4444-4444-8444-444444444444", label: "D2", pricePerTermUgx: 1_200_000 };
    await renderForStudent(new Map([[BED_B, "reserved"]]), [UNIT, pricier]);

    const labels = [...container.querySelectorAll("a, button")].map((el) => el.textContent?.trim());
    expect(labels).toEqual(["Reserved", "Reserved"]);
  });
});
