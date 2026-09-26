import type { Metadata } from "next";

import { PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { AdminProfileForm, type MyParticulars } from "@/app/(admin)/admin/profile/admin-profile-form";
import { ChangeEmailForm, ChangePasswordForm } from "@/app/(admin)/admin/profile/security-settings";
import { apiServer } from "@/lib/server-api";

export const metadata: Metadata = { title: "Profile settings" };

export default async function OpsProfilePage() {
  const particulars = await apiServer<MyParticulars>("/me/particulars");

  return (
    <>
      <PageHeader
        eyebrow="My account"
        title="Profile settings"
        description="Your personal particulars, sign-in email, and password. Your role is managed by an administrator, not here."
      />
      <SectionCard title="Personal particulars" description="Shown across the ops workspace alongside your audited actions.">
        <div className="max-w-2xl p-5">
          {particulars ? (
            <AdminProfileForm particulars={particulars} />
          ) : (
            <p className="text-sm text-slate-500 dark:text-muted-foreground">Couldn&apos;t load your profile — refresh the page.</p>
          )}
        </div>
      </SectionCard>
      <div className="mt-5">
        <SectionCard title="Sign-in email" description="The email address you use to sign in to the ops workspace.">
          <div className="max-w-2xl p-5">
            <ChangeEmailForm currentEmail={particulars?.email ?? null} />
          </div>
        </SectionCard>
      </div>
      <div className="mt-5">
        <SectionCard title="Password" description="Requires a recent sign-in.">
          <div className="max-w-2xl p-5">
            <ChangePasswordForm />
          </div>
        </SectionCard>
      </div>
    </>
  );
}
