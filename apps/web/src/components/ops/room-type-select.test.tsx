import { renderToStaticMarkup } from "react-dom/server";

import { RoomTypeSelect } from "./room-type-select";

describe("RoomTypeSelect", () => {
  const render = () => renderToStaticMarkup(<RoomTypeSelect value={undefined} onChange={() => {}} />);

  it("no longer offers Bedsitter", () => {
    expect(render()).not.toContain('value="bedsitter"');
  });

  // The Self-contained checkbox beside each photo covers this.
  it("does not offer a separate self-contained room type", () => {
    expect(render()).not.toContain('value="self_contained"');
  });

  it("names room types with proper labels", () => {
    expect(render()).toContain(">Dormitory room</option>");
  });
});
