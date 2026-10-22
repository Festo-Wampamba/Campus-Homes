import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { StudentReservationView } from "@campushomes/shared";

import { SupportDesk } from "./support-desk";

const mockApi = jest.fn();
jest.mock("../../lib/api", () => ({
  ...jest.requireActual("../../lib/api"),
  api: (...args: unknown[]) => mockApi(...args),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RESERVATION_ID = "1f2e3d4c-0000-4000-8000-000000000001";
const reservation = { id: RESERVATION_ID, propertyName: "Hunter Hostel" } as StudentReservationView;

let container: HTMLDivElement;
let root: Root;

function setValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(element) as object;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

beforeEach(() => {
  mockApi.mockReset().mockResolvedValue(null);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("sends the chosen reservation with the inquiry", async () => {
  await act(async () => root.render(<SupportDesk initialInquiries={[]} reservations={[reservation]} />));
  await act(async () => {
    setValue(document.querySelector<HTMLSelectElement>("#inquiry-reservation")!, RESERVATION_ID);
    setValue(document.querySelector<HTMLInputElement>("#inquiry-subject")!, "Move-in date");
    setValue(document.querySelector<HTMLTextAreaElement>("#inquiry-message")!, "When can I move in?");
  });
  await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());

  expect(JSON.parse(mockApi.mock.calls[0][1].body)).toMatchObject({ reservationId: RESERVATION_ID });
});

it("keeps a listing report as an explicit inquiry to Ops, without landlord routing", async () => {
  await act(async () => root.render(<SupportDesk initialInquiries={[]} reservations={[]} reportContext={{listingId:RESERVATION_ID,subject:"Report listing: Hunter Hostel"}}/>));
  expect(mockApi).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLInputElement>("#inquiry-subject")!.value).toBe("Report listing: Hunter Hostel");
  await act(async()=>setValue(document.querySelector<HTMLTextAreaElement>("#inquiry-message")!,"Please review the property information."));
  await act(async()=>document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  const payload=JSON.parse(mockApi.mock.calls[0][1].body);
  expect(payload.category).toBe("safety");
  expect(payload.message).toContain(RESERVATION_ID);
  expect(payload.listingId).toBeUndefined();
});
