import { api } from "./api";

/** Opens a private document (ID scan, ownership paper, signature) in a new
 * tab. Stored keys are not URLs: the API checks the reader and returns a
 * presigned GET that expires in minutes, so it is fetched per view.
 * Returns the URL when the browser blocked the pop-up, so the caller can show
 * a plain link (a second window.open after the await would be blocked too). */
export async function openDocument(storageKey: string): Promise<string | null> {
  // Opened before the await: browsers block window.open after an async gap.
  const tab = window.open("", "_blank");
  try {
    const { url } = await api<{ url: string }>(`/uploads/document-url?key=${encodeURIComponent(storageKey)}`);
    if (!tab) return url;
    tab.opener = null;
    tab.location.href = url;
    return null;
  } catch (error) {
    tab?.close();
    throw error;
  }
}
