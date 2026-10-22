import { budgetError, DEFAULT_DISCOVERY, discoveryApiParams, discoveryFromParams, discoveryParams } from "./discovery";

describe("shareable discovery state", () => {
  it("round-trips filters and explicit map bounds while keeping the supported campus", () => {
    const params=discoveryParams({...DEFAULT_DISCOVERY,q:"Kikoni",selfContained:"false",roomCategory:"self_contained",minPriceUgx:"300000",sort:"price_desc"},new URLSearchParams("minLat=0.32&maxLat=0.35&minLon=32.5&maxLon=32.6"));
    expect(discoveryFromParams(params)).toMatchObject({q:"Kikoni",selfContained:"false",roomCategory:"self_contained",sort:"price_desc",campus:"MUK"});
    expect(discoveryApiParams(params,2).get("page")).toBe("2");
    expect(discoveryApiParams(params).get("minLat")).toBe("0.32");
    expect(discoveryApiParams(params).get("limit")).toBe("20");
  });
  it("rejects unsupported choices and explains an inverted budget", () => {
    expect(discoveryFromParams(new URLSearchParams("campus=KYU&genderArrangement=anything&sort=random&minPriceUgx=NaN"))).toMatchObject({campus:"MUK",genderArrangement:"",minPriceUgx:"",sort:"price_asc"});
    expect(budgetError({minPriceUgx:"900000",maxPriceUgx:"200000"})).toContain("Minimum");
  });
});
