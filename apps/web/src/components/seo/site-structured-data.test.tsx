import { renderToStaticMarkup } from "react-dom/server";

import { SiteStructuredData } from "./site-structured-data";

jest.mock("../../lib/server-api", () => ({
  apiServerPublic: jest.fn(async () => ({ email: "hello@campushomes.co.ug", phone: "+256768561023" })),
}));

process.env.SITE_URL = "https://campushomes.co.ug";

type Node = Record<string, unknown> & { "@type": string };

async function graph(): Promise<Node[]> {
  const html = renderToStaticMarkup(await SiteStructuredData());
  return JSON.parse(html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""))["@graph"];
}

async function node(type: string) {
  return (await graph()).find((n) => n["@type"] === type)!;
}

it("tells search engines that Campus Homes is the same brand", async () => {
  expect((await node("Organization")).alternateName).toContain("Campus Homes");
});

it("offers a site search box that opens the hostel search", async () => {
  const website = await node("WebSite");

  expect((website.potentialAction as { target: { urlTemplate: string } }).target.urlTemplate).toBe(
    "https://campushomes.co.ug/search?q={search_term_string}",
  );
});

it("lists the support WhatsApp number as the contact point", async () => {
  expect(((await node("Organization")).contactPoint as { telephone: string }).telephone).toBe("+256768561023");
});

it("publishes the homepage FAQ for answer engines", async () => {
  expect(((await node("FAQPage")).mainEntity as unknown[]).length).toBeGreaterThan(0);
});
