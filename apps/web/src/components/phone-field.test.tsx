import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { PhoneField } from "./phone-field";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React tracks controlled values itself; set through the native setter so the
// input event is seen as a real edit.
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("PhoneField", () => {
  it("reports the number while typing, without waiting for blur", () => {
    const onChange = jest.fn();
    const container = document.createElement("div");
    act(() => createRoot(container).render(<PhoneField id="p" label="Phone" value="" onChange={onChange} />));

    act(() => typeInto(container.querySelector("input")!, "772123456"));

    expect(onChange).toHaveBeenLastCalledWith("+256772123456");
  });

  it("keeps the country example as the default hint", () => {
    expect(renderToStaticMarkup(<PhoneField label="Phone" value="" onChange={() => {}} />)).toContain("e.g. +256");
  });

  it("shows a caller-supplied hint instead of the default", () => {
    const html = renderToStaticMarkup(<PhoneField label="Phone" value="" onChange={() => {}} hint="So we can reach you." />);
    expect(html).toContain("So we can reach you.");
  });

  it("marks the number input required when the field is required", () => {
    expect(renderToStaticMarkup(<PhoneField id="p" label="Phone" required value="" onChange={() => {}} />)).toMatch(/<input[^>]*id="p"[^>]*required/);
  });
});
