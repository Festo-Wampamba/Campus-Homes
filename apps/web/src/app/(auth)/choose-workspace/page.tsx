import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { WORKSPACE_LABEL, workspaceDestination } from "@/lib/auth-routing";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Choose workspace" };

export default async function ChooseWorkspacePage() {
  const session = await requireSession();
  if (!session.access.workspaces.length) redirect("/access-required");
  return (
    <AuthCard title="Choose your workspace">
      <p className="text-sm text-muted-foreground">Open a workspace available to your account. You can switch at any time.</p>
      <nav aria-label="Workspaces" className="space-y-3">
        {[...new Set(session.access.workspaces)].map((workspace) => (
          <Link key={workspace} href={workspaceDestination(session.access, workspace)} className="block rounded-lg border border-border p-4 font-semibold hover:bg-muted">
            {WORKSPACE_LABEL[workspace]}
            {workspace === "landlord" && session.access.onboarding.landlord && <span className="mt-1 block text-xs font-normal text-muted-foreground">Complete your property onboarding</span>}
            {(workspace === "ops" || workspace === "admin") && !session.access.assurance.mfaVerified && <span className="mt-1 block text-xs font-normal text-muted-foreground">Multi-factor verification required</span>}
          </Link>
        ))}
      </nav>
      <SignOutButton />
    </AuthCard>
  );
}
