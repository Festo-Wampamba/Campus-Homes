import { apiServerPublic } from "@/lib/server-api";

const FALLBACK_EMAIL = "hello@campushomes.co.ug";

/** Admin-configured support email (Platform settings), with the backend's own default. */
export async function getSupportEmail(): Promise<string> {
  const contact = await apiServerPublic<{ email: string }>("/listings/support-contact");
  return contact?.email || FALLBACK_EMAIL;
}
