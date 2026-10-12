import { COORDINATE_EXAMPLES, isInUganda, parseCoordinates } from "./coordinates";

describe("parseCoordinates", () => {
  it.each([
    ["0°19′45″N 32°33′12″E", { lat: 0.329167, lon: 32.553333 }],
    ["0°19'45\"N, 32°33'12\"E", { lat: 0.329167, lon: 32.553333 }],
    ["0 19 45 N 32 33 12 E", { lat: 0.329167, lon: 32.553333 }],
    ["N0°19.75' E32°33.2'", { lat: 0.329167, lon: 32.553333 }],
    ["0.329167, 32.5525", { lat: 0.329167, lon: 32.5525 }],
    ["0.329167 32.5525", { lat: 0.329167, lon: 32.5525 }],
    ["-0.3, 32.5", { lat: -0.3, lon: 32.5 }],
    ["0°18′00″S 32°30′00″E", { lat: -0.3, lon: 32.5 }],
    ["32°33′12″E 0°19′45″N", { lat: 0.329167, lon: 32.553333 }],
  ])("reads %s", (text, expected) => {
    expect(parseCoordinates(text)).toEqual(expected);
  });

  it.each(["", "Kasubi", "0.3", "0°75′00″N 32°33′12″E", "95, 32"])("rejects %j", (text) => {
    expect(parseCoordinates(text)).toBeNull();
  });
});

describe("isInUganda", () => {
  it("accepts Kampala", () => {
    expect(isInUganda({ lat: 0.329167, lon: 32.5525 })).toBe(true);
  });

  it("rejects a point with latitude and longitude swapped", () => {
    expect(isInUganda({ lat: 32.5525, lon: 0.329167 })).toBe(false);
  });
});

describe("COORDINATE_EXAMPLES", () => {
  it.each(COORDINATE_EXAMPLES.map(({ example }) => example))("shows only formats that parse inside Uganda: %s", (example) => {
    const parsed = parseCoordinates(example);
    expect(parsed !== null && isInUganda(parsed)).toBe(true);
  });
});
