import { api } from "./api";

/** Opens a private document (ID scan, ownership paper, signature) in a new
 * tab. Stored keys are not URLs: the API checks the reader and returns a
 * presigned GET that expires in minutes, so it is fetched per view. */
export async function openDocument(storageKey: string): Promise<void> {
  // Opened before the await: browsers block window.open after an async gap.
  const tab = window.open("", "_blank");
  try {
    const { url } = await api<{ url: string }>(`/uploads/document-url?key=${encodeURIComponent(storageKey)}`);
    if (!tab) {
      window.open(url, "_blank", "noopener");
      return;
    }
    tab.opener = null;
    tab.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}
