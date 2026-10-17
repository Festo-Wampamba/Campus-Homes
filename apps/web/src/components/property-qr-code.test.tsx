import { act } from "react";
import { createRoot } from "react-dom/client";

import { PropertyQrCode } from "./property-qr-code";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function renderUrlLink() {
  const container = document.createElement("div");
  await act(async () => createRoot(container).render(<PropertyQrCode propertyId="p1" propertyName="Naguru" />));
  return [...container.querySelectorAll("a")].find((a) => a.textContent?.endsWith("/agreement/p1"));
}

describe("PropertyQrCode", () => {
  it("shows the registration URL as a link to the form", async () => {
    expect((await renderUrlLink())?.getAttribute("href")).toBe(`${window.location.origin}/agreement/p1`);
  });

  it("opens the registration URL in a new tab", async () => {
    expect((await renderUrlLink())?.getAttribute("target")).toBe("_blank");
  });

  it("keeps the new tab from controlling the dashboard", async () => {
    expect((await renderUrlLink())?.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
