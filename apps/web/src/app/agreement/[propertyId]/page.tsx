import { redirect } from "next/navigation";

import { signInUrl } from "@/lib/auth";
import { authDestination } from "@/lib/auth-routing";
import { getServerSession } from "@/lib/session";

// Every property QR poster points here. Students now just create their
// CampusHomes account (the per-property registration form is gone), so this
// only routes them on. Keeping the URL means posters already printed and
// posted at hostels keep working.
export default async function PropertyQrPage() {
  const session = await getServerSession();
  redirect(session ? authDestination(session) : signInUrl("consumer", undefined, "student", "register"));
}
