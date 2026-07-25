"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UNIVERSITIES, type StudentProfileWithParticulars, type University } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PhoneField } from "@/components/phone-field";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const UNIVERSITY_LABELS: Record<University, string> = {
  MUK: "Makerere University (MUK)",
  MUBS: "Makerere University Business School (MUBS)",
  KIU: "Kampala International University (KIU)",
  KYU: "Kyambogo University (KYU)",
  other: "Other",
};

const selectClass = cn(
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
  "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
);
const inputClass = cn(
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
);

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function StudentProfileForm({
  next,
  profile,
}: {
  next: string;
  profile: StudentProfileWithParticulars | null;
}) {
  const router = useRouter();
  const [university, setUniversity] = useState<University | "">(profile?.university ?? "");
  const [yearOfStudy, setYearOfStudy] = useState(profile?.yearOfStudy ? String(profile.yearOfStudy) : "");
  const [name, setName] = useState(profile?.name ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(profile?.dateOfBirth ?? "");
  const [gender, setGender] = useState(profile?.gender ?? "");
  const [nationality, setNationality] = useState(profile?.nationality ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [emergencyContactName, setEmergencyContactName] = useState(profile?.emergencyContactName ?? "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(profile?.emergencyContactPhone ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!university) return;
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      await api("/students/profile", {
        method: profile ? "PATCH" : "POST",
        body: JSON.stringify({ university, yearOfStudy: yearOfStudy ? Number(yearOfStudy) : null }),
      });
      await api("/students/particulars", {
        method: "PATCH",
        body: JSON.stringify({
          name: name || undefined,
          dateOfBirth: dateOfBirth || null,
          gender: gender || null,
          nationality: nationality || null,
          address: address || null,
          emergencyContactName: emergencyContactName || null,
          emergencyContactPhone: emergencyContactPhone || null,
        }),
      });
      if (!profile) {
        router.push(next);
        router.refresh();
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your profile — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="university" required>University</Label>
        <select
          id="university"
          required
          value={university}
          onChange={(e) => setUniversity(e.target.value as University)}
          className={selectClass}
        >
          <option value="" disabled>
            Select your university
          </option>
          {UNIVERSITIES.map((id) => (
            <option key={id} value={id}>
              {UNIVERSITY_LABELS[id]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="yearOfStudy">Year of study (optional)</Label>
        <select
          id="yearOfStudy"
          value={yearOfStudy}
          onChange={(e) => setYearOfStudy(e.target.value)}
          className={selectClass}
        >
          <option value="">Prefer not to say</option>
          {[1, 2, 3, 4, 5, 6].map((year) => (
            <option key={year} value={year}>
              Year {year}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Personal details (optional)
        </p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <input id="name" className={inputClass} placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <input id="dateOfBirth" type="date" className={inputClass} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gender">Gender</Label>
              <select id="gender" className={selectClass} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nationality">Nationality</Label>
            <input id="nationality" className={inputClass} placeholder="Ugandan" value={nationality} onChange={(e) => setNationality(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <input id="address" className={inputClass} placeholder="Plot 12, Makerere Hill Road" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergencyContactName">Emergency contact name</Label>
            <input id="emergencyContactName" className={inputClass} placeholder="Jane Doe" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
          </div>
          <PhoneField
            id="emergencyContactPhone"
            label="Emergency contact phone"
            value={emergencyContactPhone}
            onChange={setEmergencyContactPhone}
          />
        </div>
      </div>

      <Button type="submit" disabled={pending || !university} className="w-full">
        {pending ? "Saving…" : profile ? "Save changes" : "Save and continue"}
      </Button>
      {saved && <p role="status" className="text-center text-sm text-teal-700">Profile updated.</p>}
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
