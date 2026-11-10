import Link from "next/link";
import { redirect } from "next/navigation";

import { signInUrl } from "@/lib/auth";
import { authDestination } from "@/lib/auth-routing";
import { getServerSession } from "@/lib/session";

export const metadata = { title: "Welcome", robots: { index: false } };

const CHOICE =
  "block min-h-11 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// Every property QR poster points here. The QR only says which hostel the
// poster hangs in: it never books a bed, records a payment or proves who
// someone is. A resident the landlord already recorded links that booking
// with the landlord's single-use code (/activate); anyone else signs up.
export default async function PropertyQrPage() {
  const session = await getServerSession();
  const isStudent = session?.access.workspaces.includes("student") ?? false;
  if (session && !isStudent) redirect(authDestination(session));

  const residentHref = isStudent ? "/activate" : signInUrl("consumer", "/activate", "student", "register");
  const applicantHref = isStudent ? "/search" : signInUrl("consumer", undefined, "student", "register");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold text-foreground">Welcome to CampusHomes</h1>
      <p className="text-sm text-muted-foreground">Choose what describes you.</p>
      <Link href={residentHref} prefetch={false} className={CHOICE}>
        <span className="block text-base font-semibold text-foreground">I already live here or have a booking</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          Open your student portal with the code from your landlord to see your room, receipts and balance.
        </span>
      </Link>
      <Link href={applicantHref} prefetch={false} className={CHOICE}>
        <span className="block text-base font-semibold text-foreground">I am looking for a room</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {isStudent ? "Browse verified rooms near your campus." : "Create a student account to browse and reserve verified rooms."}
        </span>
      </Link>
    </main>
  );
}
