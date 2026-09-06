import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Workspace access required" };

export default async function AccessRequiredPage() {
  const session = await requireSession("/access-required");
  return (
    <AuthCard title="Workspace access required">
      <p className="text-sm text-muted-foreground">You&apos;re signed in, but your account does not have access to this workspace. Contact your administrator for staff access.</p>
      {session.access.workspaces.length > 0 && <Link className="block font-semibold underline" href="/choose-workspace">Choose an available workspace</Link>}
      {!session.access.workspaces.includes("landlord") && <Link className="block font-semibold underline" href="/landlords/enroll">Get started as a landlord</Link>}
      <Link className="block font-semibold underline" href="/support">Contact support</Link>
      <SignOutButton />
    </AuthCard>
  );
}
