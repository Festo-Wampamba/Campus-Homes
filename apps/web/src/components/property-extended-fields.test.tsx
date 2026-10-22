import { renderToStaticMarkup } from "react-dom/server";

import { PropertyExtendedFields, emptyPropertyExtendedFields, serializePropertyExtendedFields } from "./property-extended-fields";

describe("PropertyExtendedFields", () => {
  it("lets the landmark description grow as a resizable text area", () => {
    const html = renderToStaticMarkup(
      <PropertyExtendedFields value={emptyPropertyExtendedFields()} onChange={() => {}} idPrefix="t" />,
    );

    expect(html).toMatch(/<textarea(?=[^>]*id="t-locationDetails")(?=[^>]*resize-y)/);
  });

  it("offers landlords the hostel description and house rules", () => {
    const html = renderToStaticMarkup(
      <PropertyExtendedFields value={emptyPropertyExtendedFields()} onChange={() => {}} idPrefix="t" />,
    );

    expect(html).toMatch(/id="t-description"[\s\S]*id="t-houseRules"/);
  });

  it("sends house rules one per line, without blank lines or stray spaces", () => {
    const payload = serializePropertyExtendedFields({
      ...emptyPropertyExtendedFields(),
      houseRules: " Visitors leave by 9 pm\n\nNo cooking in the rooms \n",
    });

    expect(payload.houseRules).toEqual(["Visitors leave by 9 pm", "No cooking in the rooms"]);
  });
});
