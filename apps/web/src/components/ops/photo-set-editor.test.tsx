import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { VisitPhoto } from "@campushomes/shared";

import { PhotoSetEditor } from "./photo-set-editor";

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

const roomPhoto: VisitPhoto = { storageKey: "uploads/lead/a.jpg", category: "bedroom", selfContained: true };

function renderEditor(onChange: (photos: VisitPhoto[]) => void) {
  act(() => root.render(<PhotoSetEditor photos={[roomPhoto]} onChange={onChange} />));
}

describe("PhotoSetEditor", () => {
  it("drops the self-contained flag when a room photo is retyped as exterior", () => {
    const onChange = jest.fn();
    renderEditor(onChange);
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Photo type"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "exterior");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith([{ storageKey: "uploads/lead/a.jpg", category: "exterior", label: undefined, selfContained: undefined }]);
  });

  it("removes a photo", () => {
    const onChange = jest.fn();
    renderEditor(onChange);
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Remove photo"]')!.click());
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
