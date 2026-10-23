import { groupByCategory, roomBathroomLabel, roomDisplayLabel } from "./room-category-list";
import type { ListingDetailResponse } from "@campushomes/shared";
type Unit=ListingDetailResponse["units"][number];
const unit:Unit={id:"one",label:"Single",capacity:1,roomCategory:"single",selfContained:false,pricePerTermUgx:500000,depositUgx:null};
describe("room category decision facts",()=>{
  it("keeps distinct deposit and capacity offers apart",()=>{
    const units=[unit,{...unit,id:"two",depositUgx:100000},{...unit,id:"three",capacity:2}];
    const groups=groupByCategory(units,new Map(units.map(row=>[row.id,[{id:`bed-${row.id}`,available:true}]])),[],[],new Map());
    expect(groups).toHaveLength(3);
    expect(groups.map(group=>group.depositUgx)).toEqual([null,100000,null]);
  });
  it("does not advertise an unavailable cheaper category as reservable",()=>{
    const groups=groupByCategory([{...unit,id:"cheap",pricePerTermUgx:200000},unit],new Map([["cheap",[{id:"held",available:false}]],["one",[{id:"free",available:true}]]]),[],[],new Map());
    expect(groups[0]).toMatchObject({pricePerTermUgx:500000,firstAvailableBedId:"free",availableCount:1});
    expect(groups[1]).toMatchObject({pricePerTermUgx:200000,firstAvailableBedId:null,availableCount:0});
  });
  it("keeps capacity and availability facts available for presentation modes",()=>{
    const groups=groupByCategory(
      [{...unit,id:"single"},{...unit,id:"double",capacity:2,roomCategory:"double"}],
      new Map([
        ["single",[{id:"single-bed",available:true}]],
        ["double",[{id:"double-bed-a",available:true},{id:"double-bed-b",available:false}]],
      ]),
      [],
      [],
      new Map(),
    );
    expect(groups.map(group=>[group.capacity,group.availableCount])).toEqual([[1,1],[2,1]]);
  });
  it("uses the public room vocabulary without changing the category key",()=>{
    expect(roomDisplayLabel({category:"single",selfContained:false})).toBe("Single non-self-contained");
    expect(roomDisplayLabel({category:"single",selfContained:true})).toBe("Single self-contained");
    expect(roomDisplayLabel({category:"double",selfContained:true})).toBe("Double self-contained");
    expect(roomBathroomLabel({selfContained:false})).toBe("Shared bathroom");
    expect(roomBathroomLabel({selfContained:true})).toBe("Private bathroom");
  });
});
