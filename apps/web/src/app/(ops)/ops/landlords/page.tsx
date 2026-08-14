import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { listingPhotoUrl } from "@/lib/cloudinary";
import { getKycQueue } from "@/lib/ops";
import { KycDecisionActions } from "./kyc-decision-actions";

export const metadata: Metadata = { title: "Landlord KYC review" };

export default async function LandlordKycQueuePage() {
  const queue = await getKycQueue();

  return (
    <>
      <h1 className="text-2xl">Landlord KYC review</h1>
      {queue.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No landlords awaiting review.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {queue.map((row) => {
            const idDocUrl = row.id_doc_storage_key ? listingPhotoUrl(row.id_doc_storage_key) : null;
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
                        see project notes) — idDocUrl only ever appears for a
                        handful of legacy accounts that uploaded one before
                        this changed. Nothing shown when it's absent, which is
                        the expected state for every new landlord now. */}
                    {idDocUrl && (
                      <a
                        href={idDocUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                      >
                        <FileText aria-hidden className="size-4" />
                        View ID document
                      </a>
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
