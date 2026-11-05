import { renderToStaticMarkup } from "react-dom/server";

import { Dialog, DialogHeader } from "./dialog";

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

it("names a dialog from its visible heading when no explicit label is provided", () => {
  const html = renderToStaticMarkup(<Dialog open onOpenChange={() => {}}><DialogHeader title="Property details" onClose={() => {}} /></Dialog>);
  const labelId = html.match(/aria-labelledby="([^"]+)"/)?.[1];
  expect(labelId).toBeTruthy();
  expect(html).toContain(`id="${labelId}"`);
  expect(html).toContain("Property details");
});
