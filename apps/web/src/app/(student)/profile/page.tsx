import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { authorizedNext } from "@/lib/auth-routing";
import { getServerSession } from "@/lib/session";
import { getStudentProfile } from "@/lib/student";
import { Card, CardContent } from "@/components/ui/card";
import { StudentProfileForm } from "./student-profile-form";

export const metadata: Metadata = { title: "Complete your profile" };

export default async function StudentProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const rawNext = (await searchParams).next;
  // authorizedNext is the same allowlist the sign-in flow uses: it rejects
  // absolute, protocol-relative and backslash/dot-segment tricks, and only
  // admits destinations this account may actually open.
  const session = await getServerSession();
  const next = session ? authorizedNext(session.access, rawNext) : null;
  const profile = await getStudentProfile();
  // `next` only ever arrives from the reserve-flow gate redirecting here for
  // a missing profile — once one exists there's nothing left to complete, so
  // send them onward. A plain nav visit (no `next`) always shows the editor.
  if (profile && next) {
    redirect(next);
  }

  return (
    <div className="max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ae5528] dark:text-orange-300">Your account</p>
      <h1 className="ch-student-page__title mt-3">{profile ? "Your profile" : "Complete your profile"}</h1>
      <p className="ch-student-page__lede">
        {profile
          ? "Keep your details up to date so landlords and our team can reach you."
          : "One quick step before you can reserve a room."}
      </p>
      <Card className="mt-7 w-full rounded-[18px] border-[#dbe7e5] shadow-[0_8px_24px_rgba(23,63,67,0.04)]">
        <CardContent className="p-6 sm:p-8">
          <h2 className="mb-1 text-lg font-bold text-foreground">Student details</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {profile
              ? "Keep your details up to date."
              : "One quick step before you can reserve a room."}
          </p>
          <StudentProfileForm next={next ?? "/search"} profile={profile} />
        </CardContent>
      </Card>
    </div>
  );
}
