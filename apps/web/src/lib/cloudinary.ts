const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

// Listing photos are normally stored as Cloudinary public IDs (`storage_key`),
// but seed/demo data stores plain hotlinked sample-photo URLs instead (no
// Cloudinary account needed for local dev) — pass those through unchanged.
// Returns null when neither applies (no cloud name configured yet) — callers
// render a placeholder instead of a broken image.
export function listingPhotoUrl(storageKey: string, width = 800): string | null {
  if (storageKey.startsWith("http://") || storageKey.startsWith("https://")) {
    return storageKey;
  }
  if (!CLOUD_NAME) return null;
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,w_${width},q_auto,f_auto/${storageKey}`;
}

// Discriminated by `provider` — the API returns Cloudinary params or a
// Backblaze B2 presigned PUT depending on which storage is configured.
export type CloudinarySignature =
  | { provider: "cloudinary"; cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string }
  | { provider: "b2"; uploadUrl: string; publicUrl: string };

// Direct browser→storage upload (§10). Cloudinary: multipart POST carrying the
// signed params (any extra field invalidates the signature). B2: PUT the raw
// bytes to the presigned URL — the Content-Type header is stored by B2 as the
// object type (it is intentionally not part of the signature). `publicId` is
// what gets stored as storage_key: a Cloudinary public_id, or the B2 object's
// public URL (rendered as-is by listingPhotoUrl's http passthrough).
export async function uploadToCloudinary(
  file: File,
  sig: CloudinarySignature,
): Promise<{ publicId: string }> {
  if (sig.provider === "b2") {
    const res = await fetch(sig.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!res.ok) {
      throw new Error("Upload failed — check the file and try again.");
    }
    return { publicId: sig.publicUrl };
  }

  const body = new FormData();
  body.set("file", file);
  body.set("api_key", sig.apiKey);
  body.set("timestamp", String(sig.timestamp));
  body.set("folder", sig.folder);
  body.set("signature", sig.signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`, {
    method: "POST",
    body,
  });
  if (!res.ok) {
    throw new Error("Upload failed — check the file and try again.");
  }
  const data = (await res.json()) as { public_id: string };
  return { publicId: data.public_id };
}
