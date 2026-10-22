import { renderToStaticMarkup } from "react-dom/server";
import type { ListingSearchResult } from "@campushomes/shared";
import { HostelCard } from "./hostel-card";
const unavailable:ListingSearchResult={id:"10000000-0000-4000-8000-000000000001",property_id:"10000000-0000-4000-8000-000000000002",semester_id:"10000000-0000-4000-8000-000000000003",version_id:"10000000-0000-4000-8000-000000000004",expires_at:null,name:"Unavailable hostel",street_address:"Kikoni",gps_lat:.33,gps_lon:32.56,university:"MUK",gender_arrangement:null,amenities:{},description:null,photo_storage_key:null,min_capacity:null,max_capacity:null,unit_count:0,room_count:0,room_categories:[],has_self_contained:false,price_per_term_ugx:200000,max_price_per_term_ugx:800000};
it("does not advertise an unavailable minimum or infer an available bathroom arrangement",()=>{
  const html=renderToStaticMarkup(<HostelCard listing={unavailable}/>);
  expect(html).toContain("Currently unavailable");
  expect(html).toContain("Check bathroom details");
  expect(html).not.toContain("Shared bathroom");
  expect(html).not.toContain("200,000");
});
it("shows availability without publishing bed or room stock counts",()=>{
  const html=renderToStaticMarkup(<HostelCard listing={{...unavailable,unit_count:7,room_count:4,min_capacity:1,max_capacity:2}}/>);
  expect(html).toContain("Rooms available");
  expect(html).not.toMatch(/7\s*(?:<!-- -->)?\s*beds/);
  expect(html).not.toMatch(/4\s*(?:<!-- -->)?\s*rooms/);
});
