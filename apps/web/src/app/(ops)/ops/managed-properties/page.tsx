import type { Metadata } from "next";

import { ManagedPropertyReview, type ManagedPropertyItem } from "@/components/ops/managed-property-review";
import { apiServerStrict } from "@/lib/server-api";
import { requireWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Managed properties" };

export default async function OpsManagedPropertiesPage() {
  const [session, items] = await Promise.all([
    requireWorkspace("ops"),
    apiServerStrict<ManagedPropertyItem[]>("/ops/managed-properties"),
  ]);
  // Inspectors open the list to check locations; only leads (and admins) decide.
  const canDecide = session.access.roles.includes("ops_lead") || session.access.workspaces.includes("admin");
  return (
    <>
      <h1 className="text-2xl">Managed properties</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Landlords who only want to manage their property on CampusHomes, not list it to students. Check the basics,
        such as the location, then approve. Their rooms go live in their dashboard as soon as you do.
      </p>
      <ManagedPropertyReview initialItems={items} canDecide={canDecide} />
    </>
  );
}
