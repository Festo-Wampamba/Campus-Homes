import type { Metadata } from "next";

import { PageHeader, SectionCard } from "@/components/admin/admin-ui";
import { apiServer } from "@/lib/server-api";
import { AdminProfileForm, type MyParticulars } from "./admin-profile-form";
import { ChangeEmailForm, ChangePasswordForm } from "./security-settings";

export const metadata: Metadata = { title: "Profile settings" };

export default async function AdminProfilePage() {
  const particulars = await apiServer<MyParticulars>("/me/particulars");

  return (
    <>
      <PageHeader
        eyebrow="My account"
        title="Profile settings"
        description="Your personal particulars, sign-in email, and password. Your role is managed under Access control, not here."
      />
      <SectionCard title="Personal particulars" description="Visible to platform administrators alongside audited actions.">
        <div className="max-w-2xl p-5">
          {particulars ? (
            <AdminProfileForm particulars={particulars} />
          ) : (
            <p className="text-sm text-slate-500 dark:text-muted-foreground">Couldn&apos;t load your profile — refresh the page.</p>
          )}
        </div>
      </SectionCard>
      <div className="mt-5">
        <SectionCard title="Sign-in email" description="The email address you use to sign in to the admin console.">
          <div className="max-w-2xl p-5">
            <ChangeEmailForm currentEmail={particulars?.email ?? null} />
          </div>
        </SectionCard>
      </div>
      <div className="mt-5">
        <SectionCard title="Password" description="Requires your current password. Optionally signs out every other device.">
          <div className="max-w-2xl p-5">
            <ChangePasswordForm />
          </div>
        </SectionCard>
      </div>
    </>
  );
}
