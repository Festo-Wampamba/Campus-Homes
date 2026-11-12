import { planRoomImport, type ImportedRoomRow } from "./room-import";
import type { RoomType, RoomUnit } from "./room-management";

const type = (id: string, title: string, category: string) =>
  ({ id, currentVersion: { title, category }, pendingVersion: null }) as unknown as RoomType;
const single = type("t-single", "Single Room", "single");
const double = type("t-double", "Double Room", "double");
const doubleEnsuite = type("t-double-ens", "Double Self-contained", "double");
const existing = [{ id: "r1", roomTypeId: "t-single", roomCode: "A01", buildingName: "Block A", floorLabel: null }] as RoomUnit[];

const row = (roomCode: string, roomType: string, buildingName = "Block A", floorLabel = ""): ImportedRoomRow =>
  ({ rowNumber: 2, roomCode, roomType, buildingName, floorLabel });

const plan = (rows: ImportedRoomRow[], types = [single, double, doubleEnsuite]) => planRoomImport(rows, types, existing);

describe("planRoomImport", () => {
  it("matches a room type by its exact name, ignoring case", () => {
    expect(plan([row("A02", "single room")]).rows[0]!.roomTypeId).toBe("t-single");
  });

  it("matches a room type by category when only one type has it", () => {
    expect(plan([row("A02", "Single")]).rows[0]!.roomTypeId).toBe("t-single");
  });

  it("asks for the exact name when a category fits several types", () => {
    expect(plan([row("A02", "Double")]).rows[0]!.error).toBe('"Double" fits several room types; use the exact name');
  });

  it("refuses to guess when two room types share a name", () => {
    const twin = type("t-single-2", "Single Room", "single");
    expect(plan([row("A02", "Single Room")], [single, twin]).rows[0]!.error).toBe(
      'Several room types are called "Single Room"; pick "Single Room #1" or "Single Room #2" from the template list',
    );
  });

  it("never numbers a twin into another room type's name", () => {
    const twin = type("t-single-2", "Single Room", "single");
    const numbered = type("t-numbered", "Single Room #1", "single");
    expect(plan([row("A02", "Single Room #1")], [single, twin, numbered]).rows[0]!.roomTypeId).toBe("t-numbered");
  });

  it("matches the template name of a room type that shares its title", () => {
    const withBathroom = (id: string, bathroomType: string) =>
      ({ id, currentVersion: { title: "Double Room", category: "double", capacity: 2, bathroomType, pricePerTermUgx: 1_200_000 }, pendingVersion: null }) as unknown as RoomType;
    const types = [withBathroom("t-shared", "shared"), withBathroom("t-ensuite", "ensuite")];
    expect(plan([row("A02", "Double Room - self-contained")], types).rows[0]!.roomTypeId).toBe("t-ensuite");
  });

  it("names twins by their rent when only the rent differs", () => {
    const withRent = (id: string, pricePerTermUgx: number) =>
      ({ id, currentVersion: { title: "Double Room", category: "double", capacity: 2, bathroomType: "shared", pricePerTermUgx }, pendingVersion: null }) as unknown as RoomType;
    const types = [withRent("t-cheap", 950_000), withRent("t-dear", 1_250_000)];
    expect(plan([row("A02", "double room - ugx 1.25m")], types).rows[0]!.roomTypeId).toBe("t-dear");
  });

  it("matches a room type by its pending new name", () => {
    const renamed = { ...single, pendingVersion: { title: "Single Deluxe", category: "single" } } as unknown as RoomType;
    expect(plan([row("A02", "Single Deluxe")], [renamed]).rows[0]!.roomTypeId).toBe("t-single");
  });

  it("flags a building name longer than 120 characters instead of cutting it", () => {
    expect(plan([row("A02", "Single Room", "B".repeat(121))]).rows[0]!.error).toBe("Building is too long (120 characters at most)");
  });

  it("uses the only room type when the sheet leaves it blank", () => {
    expect(plan([row("A02", "")], [single]).rows[0]!.roomTypeId).toBe("t-single");
  });

  it("updates an existing room instead of adding a second room", () => {
    const result = plan([row("A01", "Double Room", "Block A", "First")]);
    expect(result.batches).toEqual([]);
    expect(result.updates).toEqual([{roomId:"r1",roomTypeId:"t-double",roomCode:"A01",buildingName:"Block A",floorLabel:"First"}]);
  });
  it("skips unchanged rooms on repeated uploads", () => {
    const result=plan([row("A01", "Single Room")]);
    expect(result.unchangedCount).toBe(1); expect(result.batches).toEqual([]); expect(result.updates).toEqual([]);
  });
  it("uses a stable ID for room renames and rejects IDs outside the property", () => {
    expect(plan([{...row("Renamed", "Single Room", "Block B"),roomId:"r1"}]).updates[0]?.roomId).toBe("r1");
    expect(plan([{...row("A02", "Single Room"),roomId:"foreign-room"}]).rows[0]?.error).toMatch(/does not belong/);
  });

  it("allows the same code in another building", () => {
    expect(plan([row("A01", "Single Room", "Block B")]).rows[0]!.error).toBeNull();
  });

  it("flags a code listed twice in the file", () => {
    expect(plan([row("A02", "Single Room"), row("A02", "Single Room")]).rows[1]!.error).toBe("Listed twice in this file");
  });

  it("groups valid rows by room type, building and floor for the bulk endpoint", () => {
    const { batches } = plan([row("A02", "Single Room", "Block A", "1"), row("A03", "Single Room", "Block A", "1"), row("B1", "Double Room", "Block B")]);
    expect(batches).toEqual([
      { roomTypeId: "t-single", buildingName: "Block A", floorLabel: "1", roomCodes: ["A02", "A03"] },
      { roomTypeId: "t-double", buildingName: "Block B", floorLabel: null, roomCodes: ["B1"] },
    ]);
  });

  it("splits a group into batches of 200", () => {
    const rows = Array.from({ length: 450 }, (_, i) => row(`R${i}`, "Single Room"));
    expect(plan(rows).batches.map((b) => b.roomCodes.length)).toEqual([200, 200, 50]);
  });
});

describe("planRoomImport batches", () => {
  it("keeps groups apart when a building or floor contains the separator", () => {
    const { batches } = planRoomImport(
      [{ rowNumber: 2, roomCode: "X1", roomType: "Single Room", buildingName: "A|B", floorLabel: "C" },
        { rowNumber: 3, roomCode: "X2", roomType: "Single Room", buildingName: "A", floorLabel: "B|C" }],
      [{ id: "t", currentVersion: { title: "Single Room", category: "single" }, pendingVersion: null } as unknown as RoomType],
      [],
    );
    expect(batches).toHaveLength(2);
  });
});

it('does not create a second room when the building was omitted for an existing code', () => {
  const result = planRoomImport([row('A01','Single Room','')],[single],existing);
  expect(result.validCount).toBe(0);expect(result.rows[0]?.error).toContain('specify its building');
});
it('flags repeated stable room IDs even when their proposed codes differ', () => {
  const result=planRoomImport([{...row('A01','Single Room'),roomId:'r1'},{...row('Renamed','Single Room'),roomId:'r1'}],[single],existing);
  expect(result.rows[1]?.error).toContain('Listed twice');
});

it('accepts a legacy category/bathroom/rent label without requiring a variant',()=>{
  const spec={...double,currentVersion:{...double.currentVersion!,title:'Double Room - Executive',bathroomType:'ensuite',capacity:2,pricePerTermUgx:900000}} as RoomType;
  const result=plan([row('NEW1','Double self-contained - UGX 900k')],[spec]);
  expect(result.rows[0]?.roomTypeId).toBe(spec.id);
  expect(result.rows[0]?.error).toBeNull();
});
it('does not guess between two variants with the same category and price',()=>{
  const types=['Executive','Mini'].map((name,i)=>({...double,id:`variant-${i}`,currentVersion:{...double.currentVersion!,title:`Double Room - ${name}`,bathroomType:'ensuite',capacity:2,pricePerTermUgx:900000}} as RoomType));
  expect(plan([row('NEW1','Double self-contained - UGX 900k')],types).rows[0]?.error).toContain('several variants');
});
