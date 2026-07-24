"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminField, adminFieldClass, adminTextareaClass } from "@/components/admin/admin-modal";
import { PhoneField } from "@/components/phone-field";
import { api, apiErrorMessage } from "@/lib/api";

export interface MyParticulars {
  name: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export function AdminProfileForm({ particulars }: { particulars: MyParticulars }) {
  const router = useRouter();
  const [name, setName] = useState(particulars.name ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(particulars.dateOfBirth ?? "");
  const [gender, setGender] = useState(particulars.gender ?? "");
  const [nationality, setNationality] = useState(particulars.nationality ?? "");
  const [address, setAddress] = useState(particulars.address ?? "");
  const [emergencyContactName, setEmergencyContactName] = useState(particulars.emergencyContactName ?? "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(particulars.emergencyContactPhone ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      await api("/me/particulars", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || undefined,
          dateOfBirth: dateOfBirth || null,
          gender: gender || null,
          nationality: nationality.trim() || null,
          address: address.trim() || null,
          emergencyContactName: emergencyContactName.trim() || null,
          emergencyContactPhone: emergencyContactPhone || null,
        }),
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save your profile — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Full name" required>
          <input required className={adminFieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
        </AdminField>
        <AdminField label="Date of birth">
          <input type="date" className={adminFieldClass} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
        </AdminField>
        <AdminField label="Gender">
          <select className={adminFieldClass} value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </AdminField>
        <AdminField label="Nationality">
          <input className={adminFieldClass} value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="Ugandan" />
        </AdminField>
      </div>
      <AdminField label="Address">
        <textarea className={adminTextareaClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Residential address" />
      </AdminField>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Emergency contact name">
          <input className={adminFieldClass} value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="Next of kin" />
        </AdminField>
        <PhoneField label="Emergency contact phone" value={emergencyContactPhone} onChange={setEmergencyContactPhone} />
      </div>
      <div className="grid gap-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-500 sm:grid-cols-2 dark:bg-muted dark:text-muted-foreground">
        <p><span className="font-bold text-slate-700 dark:text-foreground">Email:</span> {particulars.email ?? "—"}</p>
        <p><span className="font-bold text-slate-700 dark:text-foreground">Phone:</span> {particulars.phone ?? "—"}</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
          {pending ? "Saving…" : "Save changes"}
        </button>
        {saved && <p className="text-sm font-semibold text-emerald-700">Saved.</p>}
      </div>
    </form>
  );
}
