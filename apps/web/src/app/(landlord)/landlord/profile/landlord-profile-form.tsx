"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LandlordProfileWithParticulars } from "@campushomes/shared";

import { ChangeEmailForm, ChangePasswordForm } from "@/components/account/security-settings";
import { KycBanner } from "@/components/kyc-banner";
import { PhoneField } from "@/components/phone-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ViewDocumentButton } from "@/components/view-document-button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ACCOUNT_SECTIONS, AccountSettingsNav } from "./account-settings-nav";
import { errorMessage, useParticulars, type Particulars } from "./use-particulars";

const inputClass = cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs transition-colors duration-150",
  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
);
const selectClass = inputClass;

function SaveRow({ pending, saved, label }: { pending: boolean; saved: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
      {saved && <p className="text-sm text-success">Saved.</p>}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return (
    <p aria-live="polite" role="status" className="min-h-5 text-sm text-destructive">
      {error}
    </p>
  );
}

/** RLS (`landlords_self_update`) only allows edits while kyc_status is
 * 'pending' — once verified/rejected the legal name renders as a read-only
 * summary instead of a form nobody could actually submit. */
export function IdentityForm({ profile }: { profile: LandlordProfileWithParticulars }) {
  const router = useRouter();
  const editable = profile.kycStatus === "pending";
  const [legalName, setLegalName] = useState(profile.legalName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      await api("/landlords/profile", {
        method: "POST",
        body: JSON.stringify({ legalName }),
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your profile. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {editable ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile-legal-name" required>Legal name</Label>
            <Input
              id="profile-legal-name"
              required
              minLength={2}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
            />
          </div>
          <SaveRow pending={pending} saved={saved} label="Save changes" />
          <ErrorLine error={error} />
        </form>
      ) : (
        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">Legal name</p>
            <p className="mt-1 text-sm text-foreground">{profile.legalName}</p>
          </div>
        </div>
      )}
      {profile.idDocStorageKey && (
        <ViewDocumentButton storageKey={profile.idDocStorageKey} label="View ID document" />
      )}
    </div>
  );
}

export function PersonalDetailsForm({ particulars }: { particulars: Particulars }) {
  const { fields, setField } = particulars;
  return (
    <form onSubmit={particulars.save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-dob">Date of birth</Label>
          <input id="profile-dob" type="date" className={inputClass} value={fields.dateOfBirth} onChange={(e) => setField("dateOfBirth", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-gender" required>Gender</Label>
          <select id="profile-gender" required className={selectClass} value={fields.gender} onChange={(e) => setField("gender", e.target.value)}>
            <option value="" disabled>Choose…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-nationality">Nationality</Label>
        <input id="profile-nationality" className={inputClass} placeholder="Ugandan" value={fields.nationality} onChange={(e) => setField("nationality", e.target.value)} />
      </div>
      <PhoneField
        id="profile-contact-phone"
        label="Phone number"
        required
        value={fields.contactPhone}
        onChange={(value) => setField("contactPhone", value)}
        hint="So students and our team can reach you."
        labelClassName="text-sm font-semibold"
        hintClassName="text-xs"
      />
      <div className="space-y-1.5">
        <Label htmlFor="profile-address">Address</Label>
        <input id="profile-address" className={inputClass} placeholder="Plot 12, Makerere Hill Road" value={fields.address} onChange={(e) => setField("address", e.target.value)} />
      </div>
      <SaveRow pending={particulars.pending} saved={particulars.saved} label="Save details" />
      <ErrorLine error={particulars.error} />
    </form>
  );
}

export function ContactDetailsForm({ particulars }: { particulars: Particulars }) {
  const { fields, setField } = particulars;
  return (
    <form onSubmit={particulars.save} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="profile-emergency-name">Emergency contact name</Label>
        <input id="profile-emergency-name" className={inputClass} placeholder="Jane Doe" value={fields.emergencyContactName} onChange={(e) => setField("emergencyContactName", e.target.value)} />
      </div>
      <PhoneField
        id="profile-emergency-phone"
        label="Emergency contact phone"
        value={fields.emergencyContactPhone}
        onChange={(value) => setField("emergencyContactPhone", value)}
      />
      <SaveRow pending={particulars.pending} saved={particulars.saved} label="Save details" />
      <ErrorLine error={particulars.error} />
    </form>
  );
}

export function LandlordAccountSettings({
  profile,
  hasLiveListing,
  email,
}: {
  profile: LandlordProfileWithParticulars;
  hasLiveListing: boolean | null;
  email: string | null;
}) {
  const particulars = useParticulars(profile);
  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
      <AccountSettingsNav />
      <div className="max-w-3xl space-y-6">
        <SettingsCard id="personal">
          <PersonalDetailsForm particulars={particulars} />
        </SettingsCard>
        <SettingsCard id="identity">
          <KycBanner status={profile.kycStatus} hasLiveListing={hasLiveListing} />
          <IdentityForm profile={profile} />
        </SettingsCard>
        <SettingsCard id="contact">
          <ContactDetailsForm particulars={particulars} />
        </SettingsCard>
        <SettingsCard id="security">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Sign-in email</h3>
            <ChangeEmailForm currentEmail={email} />
          </div>
          <hr className="border-border" />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Password</h3>
            <ChangePasswordForm />
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}

/** One settings section: titled card with a one-line purpose, then its form. */
function SettingsCard({ id, children }: { id: (typeof ACCOUNT_SECTIONS)[number]["id"]; children: React.ReactNode }) {
  const section = ACCOUNT_SECTIONS.find((s) => s.id === id)!;
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="border-b border-border px-5 py-4 sm:px-6">
        <h2 id={`${id}-h`} className="font-display text-lg font-semibold">{section.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
      </header>
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </section>
  );
}
