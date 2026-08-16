"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { listingPhotoUrl, uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

type ListingPhoto = { id: string; storageKey: string; isPrimary: boolean };
type Loaded = { propertyName: string; listingStatus: string; photos: ListingPhoto[] };

export function ListingPhotosManager({ listingId }: { listingId: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  type ListingForPublishResponse = {
    property: { name: string };
    listing: { status: string };
    photos: ListingPhoto[];
  };

  async function load() {
    const res = await api<ListingForPublishResponse>(`/ops/listings/${listingId}`);
    setData({ propertyName: res.property.name, listingStatus: res.listing.status, photos: res.photos });
  }

  useEffect(() => {
    let cancelled = false;
    api<ListingForPublishResponse>(`/ops/listings/${listingId}`)
      .then((res) => {
        if (cancelled) return;
        setData({ propertyName: res.property.name, listingStatus: res.listing.status, photos: res.photos });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this listing.");
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  async function upload() {
    if (files.length === 0) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const storageKeys: string[] = [];
      for (const file of files) {
        const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
        const { publicId } = await uploadToCloudinary(file, sig);
        storageKeys.push(publicId);
      }
      await api(`/ops/listings/${listingId}/photos`, {
        method: "POST",
        body: JSON.stringify({ storageKeys }),
      });
      setFiles([]);
      setNotice(`Added ${storageKeys.length} photo${storageKeys.length === 1 ? "" : "s"}.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Couldn't add photos — try again."));
    } finally {
      setPending(false);
    }
  }

  if (error && !data) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-card p-4">
        <p className="font-semibold text-foreground">{data.propertyName}</p>
        <p className="text-sm text-muted-foreground">Listing status: {data.listingStatus}</p>
      </div>

      {data.listingStatus !== "verified" && data.photos.length === 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          This listing hasn&apos;t been published yet — publish it first, then come back here to add photos.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Current photos ({data.photos.length})</p>
        {data.photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {data.photos.map((photo) => {
              const url = listingPhotoUrl(photo.storageKey, 400);
              return (
                <div key={photo.id} className="overflow-hidden rounded-md border border-border">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary-origin storage URL
                    <img src={url} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="grid aspect-square place-items-center bg-muted text-xs text-muted-foreground">
                      No preview
                    </div>
                  )}
                  {photo.isPrimary && (
                    <p className="px-2 py-1 text-center text-xs font-semibold text-muted-foreground">Primary</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-md border border-border p-4">
        <p className="text-sm font-semibold text-foreground">Add photos</p>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="text-sm"
        />
        {files.length > 0 && (
          <p className="text-xs text-muted-foreground">{files.length} file(s) selected.</p>
        )}
        <button
          type="button"
          disabled={pending || files.length === 0}
          onClick={upload}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45"
        >
          <Upload aria-hidden className="size-4" />
          {pending ? "Uploading…" : "Upload"}
        </button>
        {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
