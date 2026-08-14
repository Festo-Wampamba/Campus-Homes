import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { getServerSession } from "@/lib/session";
import { getStudentProfile } from "@/lib/student";
import { getMyTenantAgreement, getPropertySummary, getTenantAgreementTemplate } from "@/lib/tenant-agreement";
import { TenantAgreementForm } from "./tenant-agreement-form";

export const metadata: Metadata = { title: "Tenant agreement" };

export default async function TenantAgreementPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const property = await getPropertySummary(propertyId);
  if (!property) {
    notFound();
  }

  const session = await getServerSession();
  if (!session) {
    // Scanning the property's QR code is the entry point — the visitor
    // hasn't necessarily signed in (or even registered) yet. Preserve this
    // exact page as `next` through both sign-in and sign-up so completing
    // either lands them right back here instead of a generic home page.
    redirect(`/sign-in?next=/agreement/${propertyId}`);
  }

  if (session.user.role !== "student") {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <Card className="w-full max-w-lg shadow-md">
          <CardContent className="p-6 text-center sm:p-8">
            <h1 className="font-display text-lg font-bold text-foreground">Students only</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This link is for a student completing a tenant agreement for {property.name}. You&apos;re
              signed in with a {session.user.role} account.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const profile = await getStudentProfile();
  if (!profile) {
    redirect(`/profile?next=/agreement/${propertyId}`);
  }

  const template = await getTenantAgreementTemplate(propertyId);
  const existing = template ? await getMyTenantAgreement(propertyId) : null;

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <Card className="w-full max-w-lg shadow-md">
        <CardContent className="p-6 sm:p-8">
          {!template ? (
            <>
              <h1 className="font-display text-lg font-bold text-foreground">Not ready yet</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {property.name} hasn&apos;t set up a tenant agreement form yet. Check back once they have,
                or ask them directly.
              </p>
            </>
          ) : existing ? (
            <>
              <h1 className="font-display text-lg font-bold text-foreground">
                You&apos;re all set at {property.name}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                You signed a tenant agreement for this property on{" "}
                {new Date(existing.submittedAt).toLocaleDateString([], {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                . No further action is needed.
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-lg font-bold text-foreground">{template.title}</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                {property.name} · {property.street_address}
              </p>
              <TenantAgreementForm propertyId={propertyId} template={template} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
