import type { Metadata } from "next";

import { Freshness, PageHeader } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";
import { IntegrationsManager } from "./integrations-manager";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const [data, access] = await Promise.all([
    apiServer<{ rows: { id: string | null; key: string; name: string; purpose: string; category: string; audience: string; baseUrl: string | null; enabled: boolean; configured: boolean; isSystem: boolean; config: Record<string, unknown> }[]; asOf: string }>("/admin/integrations"),
    apiServer<{ permissions: string[] }>("/admin/access/me"),
  ]);
  return <><PageHeader eyebrow="Configuration" title="Integrations" description="Safe configuration health for external services. Credential values never leave the API environment." />
    <IntegrationsManager rows={data?.rows ?? []} permissions={access?.permissions ?? []} />{data && <div className="mt-3"><Freshness asOf={data.asOf} source="API environment and integration catalog" /></div>}</>;
}
