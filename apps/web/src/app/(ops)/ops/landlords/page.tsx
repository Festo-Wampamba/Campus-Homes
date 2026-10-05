import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { ViewDocumentButton } from "@/components/view-document-button";
import { getKycQueue } from "@/lib/ops";
import { KycDecisionActions } from "./kyc-decision-actions";

export const metadata: Metadata = { title: "Landlord identity review" };

export default async function LandlordKycQueuePage() {
  const queue = await getKycQueue();

  return (
    <>
      <h1 className="text-2xl">Landlord identity review</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Confirm who a landlord is before their properties can go live.
      </p>
      {queue.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No landlords awaiting review.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {queue.map((row) => {
            return (
              <Card key={row.user_id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-display text-sm font-semibold text-foreground">
                      {row.legal_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {row.name} · {row.phone ?? "no phone"} · {row.email ?? "no email"}
                    </p>
                    {/* We no longer ask landlords for an ID document (privacy —
                        see project notes) — the link only ever appears for a
                        handful of legacy accounts that uploaded one before
                        this changed. Nothing shown when it's absent, which is
                        the expected state for every new landlord now. */}
                    {row.id_doc_storage_key && (
                      <ViewDocumentButton storageKey={row.id_doc_storage_key} label="View ID document" />
                    )}
                  </div>
                  <KycDecisionActions userId={row.user_id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
