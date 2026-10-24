import { renderToStaticMarkup } from "react-dom/server";

import { PropertyExtendedFields, customHouseRules, emptyPropertyExtendedFields, serializePropertyExtendedFields, toggleHouseRule } from "./property-extended-fields";

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

describe("house rule picker", () => {
  it("adds a ticked common rule ahead of the landlord's own rules", () => {
    expect(toggleHouseRule("Water off after 10 pm", "No pets", true)).toBe("No pets\nWater off after 10 pm");
  });

  it("removes an unticked common rule and keeps the landlord's own rules", () => {
    expect(toggleHouseRule("No pets\nWater off after 10 pm", "No pets", false)).toBe("Water off after 10 pm");
  });

  it("shows only the landlord's own rules in the custom box", () => {
    expect(customHouseRules("No pets\nWater off after 10 pm")).toBe("Water off after 10 pm");
  });

  it("no longer offers an Accessibility section", () => {
    const html = renderToStaticMarkup(
      <PropertyExtendedFields value={emptyPropertyExtendedFields()} onChange={() => {}} idPrefix="t" />,
    );

    expect(html).not.toContain("Accessibility");
  });
});
