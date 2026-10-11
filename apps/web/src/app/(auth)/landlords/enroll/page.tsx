import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth-card";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { workspaceDestination } from "@/lib/auth-routing";
import { requireSession } from "@/lib/session";
import { EnrollLandlord } from "./enroll-landlord";

export const dynamic = "force-dynamic";

export default async function LandlordEnrollmentPage() {
  const session = await requireSession("/landlords/enroll");
  if (session.access.workspaces.includes("landlord")) {
    redirect(workspaceDestination(session.access, "landlord"));
  }
  // A staff account can never also hold a landlord workspace (one account,
  // one staff role, never staff + consumer), so offering "Continue" would only
  // produce an error. This happens when a staff member is the one signed in on
  // this browser while a landlord tries to sign in.
  if (session.access.workspaces.some((w) => w === "ops" || w === "admin")) {
    return (
      <AuthCard title="Signed in with a staff account">
        <p className="text-sm leading-6 text-muted-foreground">
          This browser is signed in as <strong className="text-foreground">{session.user.name || "a staff member"}</strong>,
          a CampusHomes staff account. Staff accounts can&apos;t also be landlord accounts.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Sign out, then sign in with your landlord account. To use both at once, open the second one in
          another browser or a private window.
        </p>
        <div className="mt-5">
          <SignOutButton />
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Add your landlord workspace">
      <p className="text-sm leading-6 text-muted-foreground">
        Use one identity for every CampusHomes workspace you are authorized to access.
      </p>
      <EnrollLandlord />
    </AuthCard>
  );
}
