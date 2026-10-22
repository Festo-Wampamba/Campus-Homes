import { renderToStaticMarkup } from "react-dom/server";
import { ClipboardList } from "lucide-react";

import { HouseRuleList, houseRuleIcon } from "./house-rule-list";

describe("HouseRuleList", () => {
  it("renders supplied rule text with a matching icon", () => {
    const html = renderToStaticMarkup(
      <HouseRuleList rules={["No loud music after 10pm", "Visitors must sign in"]} />,
    );

    expect(html).toContain("No loud music after 10pm");
    expect(html).toContain("Visitors must sign in");
    expect(html.match(/<svg/g)?.length).toBe(2);
  });

  it("does not invent a rule when none was supplied", () => {
    expect(renderToStaticMarkup(<HouseRuleList rules={[]} />)).toBe("");
    expect(houseRuleIcon("A rule we do not recognise")).toBe(ClipboardList);
  });
});
