"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileCheck2 } from "lucide-react";
import type { LandlordProfile } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
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
export function LandlordProfileForm({ profile }: { profile: LandlordProfile }) {
  const router = useRouter();
  const editable = profile.kycStatus === "pending";
  const [legalName, setLegalName] = useState(profile.legalName);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  if (!editable) {
    return (
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
    );
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="profile-legal-name">Legal name</Label>
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
  );
}
