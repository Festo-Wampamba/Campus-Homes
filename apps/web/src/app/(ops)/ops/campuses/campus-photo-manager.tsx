"use client";

import { useState } from "react";
import { Building2, Upload } from "lucide-react";
import type { Campus, University } from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";
import { CAMPUS_LOCATIONS } from "@/lib/campuses";
import { listingPhotoUrl, uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function CampusPhotoManager({ initialCampuses }: { initialCampuses: Campus[] }) {
  const [photoByUniversity, setPhotoByUniversity] = useState<Record<string, string | null>>(
    Object.fromEntries(initialCampuses.map((c) => [c.university, c.photo_storage_key])),
  );

  return (
    <ul className="space-y-3">
      {Object.values(CAMPUS_LOCATIONS).map((campus) => (
        <CampusRow
          key={campus.code}
          code={campus.code}
          name={campus.name}
          photoStorageKey={photoByUniversity[campus.code] ?? null}
          onUploaded={(storageKey) =>
            setPhotoByUniversity((prev) => ({ ...prev, [campus.code]: storageKey }))
          }
        />
      ))}
    </ul>
  );
}

function CampusRow({
  code,
  name,
  photoStorageKey,
  onUploaded,
}: {
  code: University;
  name: string;
  photoStorageKey: string | null;
  onUploaded: (storageKey: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = photoStorageKey ? listingPhotoUrl(photoStorageKey, 200) : null;

  async function handleFile(file: File) {
    setError(null);
    setPending(true);
    try {
      const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
      const { publicId } = await uploadToCloudinary(file, sig);
      await api(`/ops/campuses/${code}/photo`, {
        method: "POST",
        body: JSON.stringify({ storageKey: publicId }),
      });
      onUploaded(publicId);
    } catch (err) {
      setError(errorMessage(err, "Couldn't upload that photo — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-4">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- small admin-only thumbnail preview
          <img src={url} alt={name} className="size-full object-cover" />
        ) : (
          <Building2 aria-hidden className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{name}</p>
        <p className="text-sm text-muted-foreground">{code}</p>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold shadow-xs transition-colors duration-150 hover:bg-muted">
        <Upload aria-hidden className="size-4" />
        {pending ? "Uploading…" : photoStorageKey ? "Replace" : "Upload"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </label>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </li>
  );
}
