import { renderToStaticMarkup } from "react-dom/server";

import { CoordinatesHint } from "./coordinates-hint";

describe("CoordinatesHint", () => {
  it("lists the accepted formats before anything is typed", () => {
    expect(renderToStaticMarkup(<CoordinatesHint text="" />)).toContain("0°19′45″N 32°33′12″E");
  });

  it("says an unsupported entry isn't a supported format", () => {
    expect(renderToStaticMarkup(<CoordinatesHint text="Kasubi near the market" />)).toContain("isn&#x27;t a supported coordinates format");
  });

  it("shows sample formats alongside an unsupported entry", () => {
    expect(renderToStaticMarkup(<CoordinatesHint text="Kasubi near the market" />)).toContain("0.329167, 32.5525");
  });

  it("warns that a point outside Uganda was not saved", () => {
    expect(renderToStaticMarkup(<CoordinatesHint text="32.5525, 0.329167" />)).toContain("outside Uganda");
  });

  it("confirms the decimals it will use", () => {
    expect(renderToStaticMarkup(<CoordinatesHint text="0°19′45″N 32°33′12″E" />)).toContain("Using 0.329167, 32.553333");
  });
});
