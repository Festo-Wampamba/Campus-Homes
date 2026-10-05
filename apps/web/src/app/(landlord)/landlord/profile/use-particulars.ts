"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LandlordProfileWithParticulars } from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

// One state for both the Personal details and Contact & emergency sections:
// either section's Save sends all six fields, so saving one never blanks the
// other.
export function useParticulars(profile: LandlordProfileWithParticulars) {
  const router = useRouter();
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth ?? "");
  const [gender, setGender] = useState(profile.gender ?? "");
  const [nationality, setNationality] = useState(profile.nationality ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [emergencyContactName, setEmergencyContactName] = useState(profile.emergencyContactName ?? "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(profile.emergencyContactPhone ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fields = { dateOfBirth, gender, nationality, address, emergencyContactName, emergencyContactPhone };
  const setters = {
    dateOfBirth: setDateOfBirth,
    gender: setGender,
    nationality: setNationality,
    address: setAddress,
    emergencyContactName: setEmergencyContactName,
    emergencyContactPhone: setEmergencyContactPhone,
  };

  function setField(name: keyof typeof fields, value: string) {
    setters[name](value);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
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
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your details. Try again."));
    } finally {
      setPending(false);
    }
  }

  return { fields, setField, save, pending, saved, error };
}

export type Particulars = ReturnType<typeof useParticulars>;
