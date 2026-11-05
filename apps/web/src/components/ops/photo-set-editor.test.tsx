import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { orderPhotosCoverFirst, type VisitPhoto } from "@campushomes/shared";

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

describe("cover rule", () => {
  const room: VisitPhoto = { storageKey: "room.jpg", category: "bedroom" };
  const outside: VisitPhoto = { storageKey: "outside.jpg", category: "exterior" };
  const landlord: VisitPhoto = { storageKey: "landlord.jpg", category: "other" };

  it("puts the landlord's cover first even when an exterior photo exists", () => {
    expect(orderPhotosCoverFirst([room, outside, landlord], "landlord.jpg")[0]).toBe(landlord);
  });

  it("uses the first exterior photo when the landlord set no cover", () => {
    expect(orderPhotosCoverFirst([room, outside], null)[0]).toBe(outside);
  });

  it("keeps the first photo when there is no landlord cover or exterior photo", () => {
    expect(orderPhotosCoverFirst([room, landlord], null)[0]).toBe(room);
  });

  it("labels the exterior photo as the cover in the editor", () => {
    act(() => root.render(<PhotoSetEditor photos={[room, outside]} onChange={() => {}} />));
    const coverTile = [...container.querySelectorAll<HTMLSelectElement>('select[aria-label="Photo type"]')]
      .find((select) => select.value === "exterior")?.parentElement;
    expect(coverTile?.textContent).toContain("Cover");
  });
});
