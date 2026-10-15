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

async function render(availability: { id: string; unit_id: string; available: boolean; held?: boolean }[]) {
  await act(async () =>
    root.render(
      <RoomCategoryList
        listingId="listing-1"
        units={[UNIT]}
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

async function renderForStudent(myLiveBeds: Map<string, "reserved" | "booked">) {
  await act(async () =>
    root.render(
      <RoomCategoryList
        listingId="listing-1"
        units={[UNIT]}
        availability={[
          { id: BED_A, unit_id: UNIT.id, available: true, held: false },
          { id: BED_B, unit_id: UNIT.id, available: false, held: true },
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
  it("counts a bed on a 24h hold as reserved", async () => {
    await render([
      { id: BED_A, unit_id: UNIT.id, available: true, held: false },
      { id: BED_B, unit_id: UNIT.id, available: false, held: true },
    ]);

    expect(container.textContent).toContain("1 reserved · 24h hold");
  });

  it("says a room type is reserved for now, not fully booked, when only holds block it", async () => {
    await render([
      { id: BED_A, unit_id: UNIT.id, available: false, held: true },
      { id: BED_B, unit_id: UNIT.id, available: false, held: true },
    ]);

    expect(container.textContent).toContain("All reserved for now");
  });

  it("still says fully booked when the beds are taken, not held", async () => {
    await render([
      { id: BED_A, unit_id: UNIT.id, available: false, held: false },
      { id: BED_B, unit_id: UNIT.id, available: false, held: false },
    ]);

    expect(container.textContent).toContain("Fully booked");
  });

  it("shows Reserved instead of Reserve on a room type the student already holds", async () => {
    await renderForStudent(new Map([[BED_B, "reserved"]]));

    const labels = [...container.querySelectorAll("a, button")].map((el) => el.textContent?.trim());
    expect(labels).toEqual(["Reserved"]);
  });
});
