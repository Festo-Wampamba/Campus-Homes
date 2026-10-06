import { renderToStaticMarkup } from "react-dom/server";

import { PropertyExtendedFields, emptyPropertyExtendedFields } from "./property-extended-fields";

describe("PropertyExtendedFields", () => {
  it("lets the landmark description grow as a resizable text area", () => {
    const html = renderToStaticMarkup(
      <PropertyExtendedFields value={emptyPropertyExtendedFields()} onChange={() => {}} idPrefix="t" />,
    );

    expect(html).toMatch(/<textarea(?=[^>]*id="t-locationDetails")(?=[^>]*resize-y)/);
  });
});
