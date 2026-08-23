import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { getLeadsQueue } from "@/lib/ops";
import { InviteLandlordAction } from "./invite-landlord-action";
import { LeadStatusActions } from "./lead-status-actions";

export const metadata: Metadata = { title: "Onboarding leads" };

function statusChip(status: string) {
  switch (status) {
    case "new":
      return <StatusChip tone="warning">New</StatusChip>;
    case "contacted":
      return <StatusChip tone="neutral">Contacted</StatusChip>;
    case "converted":
      return <StatusChip tone="success">Converted</StatusChip>;
    default:
      return <StatusChip tone="neutral">Dismissed</StatusChip>;
  }
}

export default async function LeadsQueuePage() {
  const leads = await getLeadsQueue();

  return (
    <>
      <h1 className="text-2xl">Onboarding leads</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Submissions from the public &quot;Request onboarding&quot; form on /landlords.
      </p>
      {leads.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No leads yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {leads.map((lead) => (
            <Card key={lead.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-sm font-semibold text-foreground">{lead.name}</p>
                    {statusChip(lead.status)}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {lead.phone}
                    {lead.email ? ` · ${lead.email}` : ""} · {lead.propertyLocation}
                  </p>
                  {lead.message && <p className="mt-2 max-w-lg text-sm text-foreground">{lead.message}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Submitted{" "}
                    {new Date(lead.createdAt).toLocaleDateString([], {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {lead.status !== "converted" && lead.status !== "dismissed" && (
                    <InviteLandlordAction
                      leadId={lead.id}
                      name={lead.name}
                      phone={lead.phone}
                      email={lead.email}
                    />
                  )}
                  <LeadStatusActions leadId={lead.id} status={lead.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
