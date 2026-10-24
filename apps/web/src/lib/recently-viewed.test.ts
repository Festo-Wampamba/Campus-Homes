import { getRecentlyViewed } from "./recently-viewed";

const valid = {
  id: "8bf663d3-da38-4d75-a194-f76666e0c83a",
  name: "Mirembe Student Courts",
  streetAddress: "Kikoni, Kampala",
  photoStorageKey: null,
  priceUgx: 900000,
  viewedAt: 1_792_000_000_000,
};

it("drops stored entries whose id isn't a listing UUID before they reach API paths", () => {
  window.localStorage.setItem("campushomes:recently-viewed", JSON.stringify([
    valid,
    { ...valid, id: "../reservations/mine" },
    { ...valid, id: "8bf663d3-da38-4d75-a194-f76666e0c83b", priceUgx: "free" },
  ]));

  expect(getRecentlyViewed().map((entry) => entry.id)).toEqual([valid.id]);
});
