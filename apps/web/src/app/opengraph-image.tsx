import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

export const alt = "CampusHomes: student hostels near Makerere, inspected in person";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(path.join(process.cwd(), "public/images/branding/campushomes-mark.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#003b3b",
          color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <img src={logoSrc} width={88} height={88} alt="" style={{ background: "white", borderRadius: 16, padding: 8 }} />
          <div style={{ fontSize: 44, fontWeight: 700 }}>CampusHomes</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 950 }}>
            Hostels near Makerere, inspected before they are listed.
          </div>
          <div style={{ fontSize: 30, color: "#f08080" }}>Compare rooms and prices. Reserving is free.</div>
        </div>
      </div>
    ),
    size,
  );
}
