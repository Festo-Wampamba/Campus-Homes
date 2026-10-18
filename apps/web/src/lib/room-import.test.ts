import { planRoomImport, type ImportedRoomRow } from "./room-import";
import type { RoomType, RoomUnit } from "./room-management";

const type = (id: string, title: string, category: string) =>
  ({ id, currentVersion: { title, category }, pendingVersion: null }) as unknown as RoomType;
const single = type("t-single", "Single Room", "single");
const double = type("t-double", "Double Room", "double");
const doubleEnsuite = type("t-double-ens", "Double Self-contained", "double");
const existing = [{ roomCode: "A01", buildingName: "Block A" }] as RoomUnit[];

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

  it("uses the only room type when the sheet leaves it blank", () => {
    expect(plan([row("A02", "")], [single]).rows[0]!.roomTypeId).toBe("t-single");
  });

  it("flags a room that already exists in the same building", () => {
    expect(plan([row("a01", "Single Room")]).rows[0]!.error).toBe("Already exists in this building");
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
