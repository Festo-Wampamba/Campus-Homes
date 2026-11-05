import { renderToStaticMarkup } from "react-dom/server";
import { Banknote, ClipboardList, CookingPot, Droplets, Syringe, Wine } from "lucide-react";

import { COMMON_HOUSE_RULES } from "@/components/property-extended-fields";
import { GateLock, HouseRuleList, houseRuleIcon } from "./house-rule-list";

const signature = (rule: string) => {
  const { glyphs, prohibited, badge } = houseRuleIcon(rule);
  return [...glyphs, badge, prohibited].map((part) => (typeof part === "boolean" ? String(part) : part?.displayName ?? part?.name)).join("|");
};

describe("HouseRuleList", () => {
  it("renders supplied rule text", () => {
    const html = renderToStaticMarkup(<HouseRuleList rules={["No loud music after 10pm", "Visitors must sign in"]} />);
    expect(html).toContain("Visitors must sign in");
  });

  it("does not invent a rule when none was supplied", () => {
    expect(renderToStaticMarkup(<HouseRuleList rules={[]} />)).toBe("");
  });

  it("falls back to a neutral icon for an unrecognised rule", () => {
    expect(houseRuleIcon("A rule we do not recognise").glyphs).toEqual([ClipboardList]);
  });

  it("gives every common rule its own icon", () => {
    const signatures = COMMON_HOUSE_RULES.map(signature);
    expect(new Set(signatures).size).toBe(COMMON_HOUSE_RULES.length);
  });

  it("marks a 'No ...' rule as prohibited", () => {
    expect(houseRuleIcon("No cooking in the rooms")).toEqual({ glyphs: [CookingPot], prohibited: true });
  });

  it("shows a gate with a padlock for the gate rule", () => {
    expect(houseRuleIcon("Gate closes at 11 pm").glyphs).toEqual([GateLock]);
  });

  it("shows alcohol and drugs together", () => {
    expect(houseRuleIcon("No alcohol or drugs on the premises").glyphs).toEqual([Wine, Syringe]);
  });

  it("does not read 'allocated' as a pet rule", () => {
    expect(houseRuleIcon("Rooms are allocated on arrival").glyphs).toEqual([ClipboardList]);
  });

  it("does not read 'payments' as a people rule", () => {
    expect(houseRuleIcon("Rent payments are due by the 5th").glyphs).toEqual([Banknote]);
  });

  it("does not read drinking water as an alcohol rule", () => {
    expect(houseRuleIcon("Drinking water is provided").glyphs).toEqual([Droplets]);
  });
});
