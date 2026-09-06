import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth-card";
import { workspaceDestination } from "@/lib/auth-routing";
import { requireSession } from "@/lib/session";
import { EnrollLandlord } from "./enroll-landlord";

export const dynamic = "force-dynamic";

export default async function LandlordEnrollmentPage() {
  const session = await requireSession("/landlords/enroll");
  if (session.access.workspaces.includes("landlord")) {
    redirect(workspaceDestination(session.access, "landlord"));
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
