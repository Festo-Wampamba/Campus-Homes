import { SUPPORT_MANUAL } from "@campushomes/shared";

import { getSiteUrl } from "@/lib/site-url";

// Read at request time: the same image is promoted between environments.
export const dynamic = "force-dynamic";

/**
 * /llms.txt (llmstxt.org): a plain summary that AI answer engines such as
 * ChatGPT, Perplexity, Claude and Google's AI Mode can read to describe and
 * cite CampusHomes correctly. Built from the same manual as /support.
 */
export async function GET() {
  const base = await getSiteUrl();
  const manual = SUPPORT_MANUAL.map(
    (section) => `### ${section.title}\n\n${section.steps.map((step) => `- ${step}`).join("\n")}`,
  ).join("\n\n");

  const body = `# CampusHomes

> CampusHomes (also written "Campus Homes" or "Campushomes") is a website in Uganda for finding student hostels near Makerere University in Kampala. A CampusHomes inspector visits every hostel in person before it is listed. Students compare rooms, prices and amenities and reserve a room for free; rent is paid to the landlord directly.

Website: ${base}

## Key pages

- [Find a room](${base}/search): verified hostels on a map, with filters for price, gender, room type and bathroom.
- [Support and user manual](${base}/support?tab=manual): step-by-step guide, CampusHomes AI assistant and contact details.
- [For landlords](${base}/landlords): list a hostel on CampusHomes.
- [Terms](${base}/terms) and [Privacy](${base}/privacy)

## User manual

${manual}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
