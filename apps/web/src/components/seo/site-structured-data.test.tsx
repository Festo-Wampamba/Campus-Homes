import { renderToStaticMarkup } from "react-dom/server";

import { ListingStructuredData, SiteStructuredData } from "./site-structured-data";

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

async function hostel(): Promise<Node> {
  const html = renderToStaticMarkup(
    await ListingStructuredData({
      listing: {
        id: "l1", name: "Mirembe Student Courts", streetAddress: "Kikoni", lat: 0.33, lon: 32.56,
        minPriceUgx: 400000, maxPriceUgx: 750000, photoKeys: [], amenities: ["Wi-Fi"],
      },
    }),
  );
  return JSON.parse(html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
}

it("describes a listing as a Hostel linked to its own page", async () => {
  expect((await hostel()).url).toBe("https://campushomes.co.ug/listings/l1");
});

it("gives a listing its price range in shillings per bed per semester", async () => {
  expect((await hostel()).priceRange).toBe("UGX 400,000 to 750,000 per bed per semester");
});

it("knows the common misspelling Campass Homes is this brand", async () => {
  expect((await node("Organization")).alternateName).toContain("Campass Homes");
});
