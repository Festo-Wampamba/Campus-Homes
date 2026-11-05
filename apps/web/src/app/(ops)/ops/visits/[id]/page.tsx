import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  VERIFICATION_CHECKLIST_COMPONENTS,
  normalizeVisitPhotos,
  type VerificationChecklistComponent,
} from "@campushomes/shared";

import { PhotoTile } from "@/components/listing/photo-tile";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { getPropertyListings, getPublishableSemesters, getVisitDetail } from "@/lib/ops";
import { getServerSession } from "@/lib/session";
import { ApproveVisitButton } from "./approve-visit-button";
import { ChecklistItemDialog } from "./checklist-item-dialog";
import { CreateListingToPublish } from "./create-listing-to-publish";
import { CorrectionFixPanel } from "../../inspect/[visitId]/correction-fix-panel";

export const metadata: Metadata = { title: "Visit review" };

const COMPONENT_LABEL: Record<VerificationChecklistComponent, string> = {
  location_gps: "Location & GPS",
  rooms_capacity: "Rooms & capacity",
  amenities: "Amenities",
  photos: "Photos match property",
  landlord_identity: "Landlord identity",
  safety: "Safety",
};

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [visit, session] = await Promise.all([getVisitDetail(id), getServerSession()]);
  if (!visit) {
    notFound();
  }
  // Inspectors can reach this page now (visits/mine only holds
  // not-yet-approved visits, so an approved one links here) — approve/publish
  // stay lead-only actions, the API would 403 an inspector anyway, but there
  // is no reason to render controls they can't legally use.
  const isLead = session?.access.roles.includes("ops_lead") || session?.access.workspaces.includes("admin");
  // Staged photos are jsonb {storageKey, category} since 0047 (back-compatible
  // with legacy bare strings) — normalize before rendering, or listingPhotoUrl
  // calls .startsWith on an object and 500s the whole page.
  const photos = normalizeVisitPhotos(visit.photoStorageKeys);

  // A failed lookup must never read as "no listing" or "no semester".
  let publishLoadFailed = false;
  const listings = visit.approvedAt && isLead
    ? await getPropertyListings(visit.propertyId).catch(() => { publishLoadFailed = true; return []; })
    : [];
  // A landlord-onboarded property has no listing at all, so an approved visit
  // has nothing to publish — offer the lead the applicable semesters to create one.
  const publishableSemesters =
    visit.approvedAt && isLead && listings.length === 0 && !publishLoadFailed
      ? await getPublishableSemesters(visit.propertyId).catch(() => { publishLoadFailed = true; return []; })
      : [];
  // A lead who assigned the visit to themself is its inspector, so they can
  // fix a flagged item here instead of waiting on themself in "My visits".
  const canFixHere = Boolean(session && visit.inspectorId === session.user.id);

  return (
    <>
      <h1 className="text-2xl">Visit review</h1>
      <div className="mt-6 space-y-3">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <StatusChip
                tone={
                  visit.result === "passed"
                    ? "success"
                    : visit.result === "failed"
                      ? "destructive"
                      : "neutral"
                }
              >
                {visit.result}
              </StatusChip>
              {visit.visitGpsLat && visit.visitGpsLon && (
                <p className="mt-2 text-sm text-muted-foreground">
                  GPS {visit.visitGpsLat}, {visit.visitGpsLon}
                </p>
              )}
            </div>
            {visit.propertyCoverPhotoKey && (
              <figure className="w-full max-w-60">
                <PhotoTile
                  photos={[{ storageKey: visit.propertyCoverPhotoKey }]}
                  alt="Landlord's cover photo"
                  className="aspect-video overflow-hidden rounded-md"
                />
                <figcaption className="mt-1 text-xs text-muted-foreground">
                  Landlord&apos;s cover photo, used as the listing cover
                </figcaption>
              </figure>
            )}
            {isLead && visit.result === "passed" && !visit.approvedAt && (
              <ApproveVisitButton visitId={visit.id} />
            )}
            {visit.approvedAt && <StatusChip tone="success">Approved</StatusChip>}
          </CardContent>
        </Card>

        {VERIFICATION_CHECKLIST_COMPONENTS.map((component) => {
          const entry = visit.checklist[component];
          const itemCorrections = visit.corrections.filter((c) => c.component === component);
          const hasOpenCorrection = itemCorrections.some((c) => c.status === "open");
          return (
            <ChecklistItemDialog
              key={component}
              visitId={visit.id}
              component={component}
              label={COMPONENT_LABEL[component]}
              entry={entry}
              photos={photos}
              corrections={itemCorrections}
              trigger={
                <Card className="transition-colors hover:bg-muted">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-foreground">{COMPONENT_LABEL[component]}</p>
                      <div className="flex items-center gap-2">
                        {hasOpenCorrection && (
                          <StatusChip tone="warning">Correction sent</StatusChip>
                        )}
                        {entry && (
                          <StatusChip tone={entry.passed ? "success" : "destructive"}>
                            {entry.passed ? "Pass" : "Fail"}
                          </StatusChip>
                        )}
                      </div>
                    </div>
                    {entry?.notes && (
                      <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>
                    )}
                  </CardContent>
                </Card>
              }
            />
          );
        })}

        {visit.approvedAt && listings.length > 0 && (
          <Card>
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <p className="text-sm text-muted-foreground">Ready to publish</p>
              <Link
                href={`/ops/publish/${listings[0].id}`}
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-xs transition-colors duration-150 hover:bg-teal-700"
              >
                Publish
              </Link>
            </CardContent>
          </Card>
        )}

        {canFixHere && visit.corrections.some((c) => c.status === "open") && (
          <Card>
            <CardContent className="p-5">
              <CorrectionFixPanel
                visitId={visit.id}
                corrections={visit.corrections}
                componentLabel={COMPONENT_LABEL}
                checklist={visit.checklist}
                intro="You inspected this visit, so you can fix these items here and carry on to approve and publish."
              />
            </CardContent>
          </Card>
        )}

        {publishLoadFailed && (
          <Card>
            <CardContent className="p-5">
              <p role="alert" className="text-sm text-destructive">
                Couldn&apos;t load this property&apos;s publishing options. Reload the page; if it keeps failing, sign out and back in.
              </p>
            </CardContent>
          </Card>
        )}

        {!publishLoadFailed && visit.approvedAt && visit.result === "passed" && listings.length === 0 && (
          <Card>
            <CardContent className="space-y-3 p-5">
              <p className="text-sm text-muted-foreground">
                This property has no listing yet. Pick the semester to publish it for.
              </p>
              <CreateListingToPublish
                propertyId={visit.propertyId}
                semesters={publishableSemesters}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
