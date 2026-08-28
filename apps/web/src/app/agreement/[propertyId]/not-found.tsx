import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";

// The Google Forms backup used platform-wide before this per-property flow
// existed — kept as a fallback for whenever this page can't load (bad
// property id, or the property-summary/template fetch failing outright;
// apiServerPublic()/apiServer() collapse both into the same not-found /
// "not ready" states today, so this offers an escape hatch either way
// rather than trying to disambiguate the cause).
const STUDENT_REGISTRATION_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfC4JXnuGxF6qcIoyCXpNNxQuNgKwtOmc5r8muRavSeEH8Nag/viewform";

export default function TenantAgreementNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <Card className="w-full max-w-lg shadow-md">
        <CardContent className="p-6 text-center sm:p-8">
          <h1 className="font-display text-lg font-bold text-foreground">Couldn&apos;t load this form</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link may be broken, or something went wrong on our end. You can still register using our
            paper form while we sort this out.
          </p>
          <a
            href={STUDENT_REGISTRATION_FORM_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-teal-600 px-6 text-sm font-bold text-white hover:bg-teal-700"
          >
            Use the paper form instead
          </a>
          <p className="mt-4 text-xs text-muted-foreground">
            <Link href="/" className="underline underline-offset-4 hover:text-foreground">
              Or go back to CampusHomes
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
