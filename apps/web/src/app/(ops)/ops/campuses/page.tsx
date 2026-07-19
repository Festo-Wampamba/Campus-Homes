import type { Metadata } from "next";

import { getCampuses } from "@/lib/ops";
import { CampusPhotoManager } from "./campus-photo-manager";

export const metadata: Metadata = { title: "Campus photos" };

export default async function OpsCampusesPage() {
  const campuses = await getCampuses();

  return (
    <>
      <h1 className="text-2xl">Campus photos</h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        One photo per university, shown on the public landing page&apos;s
        &quot;Browse by university&quot; tiles.
      </p>
      <div className="mt-6 max-w-2xl">
        <CampusPhotoManager initialCampuses={campuses} />
      </div>
    </>
  );
}
