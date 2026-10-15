/** @jest-environment node */
import { GET } from "./route";

process.env.SITE_URL = "https://campushomes.co.ug";

it("describes CampusHomes under the spellings people search for", async () => {
  expect(await (await GET()).text()).toContain('also written "Campus Homes" or "Campushomes"');
});

it("links the key pages with absolute URLs", async () => {
  expect(await (await GET()).text()).toContain("[Find a room](https://campushomes.co.ug/search)");
});
