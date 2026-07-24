"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileCheck2 } from "lucide-react";
import type { LandlordProfileWithParticulars } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneField } from "@/components/phone-field";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

/** RLS (`landlords_self_update`) only allows edits while kyc_status is
 * 'pending' — once verified/rejected this renders as a read-only summary
 * instead of a form nobody could actually submit. */
const inputClass = cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs transition-colors duration-150",
  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
);
const selectClass = inputClass;

export function LandlordProfileForm({ profile }: { profile: LandlordProfileWithParticulars }) {
  const router = useRouter();
  const editable = profile.kycStatus === "pending";
  const [legalName, setLegalName] = useState(profile.legalName);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth ?? "");
  const [gender, setGender] = useState(profile.gender ?? "");
  const [nationality, setNationality] = useState(profile.nationality ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [emergencyContactName, setEmergencyContactName] = useState(profile.emergencyContactName ?? "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(profile.emergencyContactPhone ?? "");
  const [particularsPending, setParticularsPending] = useState(false);
  const [particularsError, setParticularsError] = useState<string | null>(null);
  const [particularsSaved, setParticularsSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      let idDocStorageKey: string | undefined;
      if (idFile) {
        const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
        const { publicId } = await uploadToCloudinary(idFile, sig);
        idDocStorageKey = publicId;
      }
      await api("/landlords/profile", {
        method: "POST",
        body: JSON.stringify({ legalName, ...(idDocStorageKey ? { idDocStorageKey } : {}) }),
      });
      setIdFile(null);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your profile — try again."));
    } finally {
      setPending(false);
    }
  }

  async function submitParticulars(e: React.FormEvent) {
    e.preventDefault();
    setParticularsError(null);
    setParticularsSaved(false);
    setParticularsPending(true);
    try {
      await api("/landlords/particulars", {
        method: "PATCH",
        body: JSON.stringify({
          dateOfBirth: dateOfBirth || null,
          gender: gender || null,
          nationality: nationality || null,
          address: address || null,
          emergencyContactName: emergencyContactName || null,
          emergencyContactPhone: emergencyContactPhone || null,
        }),
      });
      setParticularsSaved(true);
      router.refresh();
    } catch (err) {
      setParticularsError(errorMessage(err, "Couldn't save your details — try again."));
    } finally {
      setParticularsPending(false);
    }
  }

  return (
    <div className="max-w-md space-y-8">
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
          <div className="space-y-1.5">
            <Label htmlFor="profile-id-doc">Replace ID document (optional)</Label>
            <Input
              id="profile-id-doc"
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setIdFile(e.target.files?.[0] ?? null)}
            />
            {profile.idDocStorageKey && !idFile && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileCheck2 aria-hidden className="size-3.5 shrink-0" />
                A document is already on file — only upload a new one to replace it.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
            {saved && <p className="text-sm text-success">Saved.</p>}
          </div>
          <p aria-live="polite" role="status" className="min-h-5 text-sm text-destructive">
            {error}
          </p>
        </form>
      ) : (
        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase">Legal name</p>
            <p className="mt-1 text-sm text-foreground">{profile.legalName}</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileCheck2 aria-hidden className="size-4 shrink-0" />
            {profile.idDocStorageKey ? "ID document on file" : "No ID document on file"}
          </div>
        </div>
      )}

      <form onSubmit={submitParticulars} className="space-y-4 border-t border-border pt-6">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Personal details (optional)
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-dob">Date of birth</Label>
            <input id="profile-dob" type="date" className={inputClass} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-gender">Gender</Label>
            <select id="profile-gender" className={selectClass} value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-nationality">Nationality</Label>
          <input id="profile-nationality" className={inputClass} placeholder="Ugandan" value={nationality} onChange={(e) => setNationality(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-address">Address</Label>
          <input id="profile-address" className={inputClass} placeholder="Plot 12, Makerere Hill Road" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-emergency-name">Emergency contact name</Label>
          <input id="profile-emergency-name" className={inputClass} placeholder="Jane Doe" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
        </div>
        <PhoneField
          id="profile-emergency-phone"
          label="Emergency contact phone"
          value={emergencyContactPhone}
          onChange={setEmergencyContactPhone}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={particularsPending}>
            {particularsPending ? "Saving…" : "Save details"}
          </Button>
          {particularsSaved && <p className="text-sm text-success">Saved.</p>}
        </div>
        <p aria-live="polite" role="status" className="min-h-5 text-sm text-destructive">
          {particularsError}
        </p>
      </form>
    </div>
  );
}
