import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { signInUrl } from "@/lib/auth";
import { authorizedNext, workspaceForPath, WORKSPACE_HOME } from "@/lib/auth-routing";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Verify staff access" };

export default async function MfaRequiredPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const session = await requireSession("/mfa-required");
  const staffWorkspace = session.access.workspaces.find((workspace) => workspace === "ops" || workspace === "admin");
  if (!staffWorkspace) redirect("/access-required");
  const requested = authorizedNext(session.access, params.next);
  const workspace = requested ? workspaceForPath(new URL(requested, "https://campushomes.invalid").pathname) : null;
  const next = requested && (workspace === "ops" || workspace === "admin") ? requested : WORKSPACE_HOME[staffWorkspace];
  if (session.access.assurance.mfaVerified) redirect(next);
  return (
    <AuthCard title="Verify your staff access">
      <p className="text-sm text-muted-foreground">Operations and administration require multi-factor authentication. Continue to secure sign-in to verify your identity.</p>
      {params.error && <p role="alert" className="text-sm text-destructive">Verification did not complete. Please try again or contact your administrator.</p>}
      <a href={signInUrl("staff", next)} className="block rounded-lg bg-coral-500 px-4 py-3 text-center font-semibold text-teal-900">Continue to verification</a>
      <Link className="block text-sm underline" href="/choose-workspace">Choose another workspace</Link>
      <SignOutButton />
    </AuthCard>
  );
}
