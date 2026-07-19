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

export interface CloudinarySignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

// Direct browser→Cloudinary upload (§10): the API only issues a short-lived
// signature over `folder`+`timestamp` (uploads.service.ts `sign()`), so the
// upload body must carry exactly those signed params plus file/api_key/
// signature — any extra field invalidates the signature.
export async function uploadToCloudinary(
  file: File,
  sig: CloudinarySignature,
): Promise<{ publicId: string }> {
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
