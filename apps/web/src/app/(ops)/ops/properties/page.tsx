import type { Metadata } from "next";

import { apiServer } from "@/lib/server-api";
import { OpsPropertiesList, type OpsPropertyRow } from "./ops-properties-list";

export const metadata: Metadata = { title: "Properties" };

export default async function OpsPropertiesPage() {
  const data = await apiServer<{ rows: OpsPropertyRow[] }>("/admin/properties");
  const rows = data?.rows ?? [];

  return (
    <>
      <h1 className="text-2xl">Properties</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Find a property to set up or edit its tenant agreement form.
      </p>
      <div className="mt-6">
        <OpsPropertiesList rows={rows} />
      </div>
    </>
  );
}
