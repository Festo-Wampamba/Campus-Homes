import { renderToStaticMarkup } from "react-dom/server";

import { Dialog } from "./dialog";

const render = (resizable: boolean) =>
  renderToStaticMarkup(
    <Dialog open onOpenChange={() => {}} size="xl" resizable={resizable}>
      <p>body</p>
    </Dialog>,
  );

describe("Dialog", () => {
  it("offers a corner resize handle on larger screens when resizable", () => {
    expect(render(true)).toContain("sm:resize");
  });

  it("stays fixed-size by default", () => {
    expect(render(false)).not.toContain("sm:resize");
  });
});
