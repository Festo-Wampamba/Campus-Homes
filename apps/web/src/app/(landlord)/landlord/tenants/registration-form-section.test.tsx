import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RegistrationFormSection } from "./registration-form-section";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const properties = [
  { id: "p-1", name: "Mirembe Student Courts" },
  { id: "p-2", name: "Kikoni Heights" },
];

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

it("opens on the property a property window linked from", async () => {
  await act(async () => root.render(<RegistrationFormSection properties={properties} initialPropertyId="p-2" />));
  expect(container.querySelector<HTMLSelectElement>('select[aria-label="Property"]')?.value).toBe("p-2");
});

it("shows no property picker when the landlord has one property", async () => {
  await act(async () => root.render(<RegistrationFormSection properties={properties.slice(0, 1)} />));
  expect(container.querySelector("select")).toBeNull();
});
