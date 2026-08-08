import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getStudentProfile } from "@/lib/student";
import { Card, CardContent } from "@/components/ui/card";
import { StudentProfileForm } from "./student-profile-form";
import { GoogleAccountLink } from "@/components/auth/google-account-link";

export const metadata: Metadata = { title: "Complete your profile" };

export default async function StudentProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const rawNext = (await searchParams).next;
  // Only ever redirect within the app — reject absolute/protocol-relative
  // URLs so `next` can't be used as an open redirect.
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const profile = await getStudentProfile();
  // `next` only ever arrives from the reserve-flow gate redirecting here for
  // a missing profile — once one exists there's nothing left to complete, so
  // send them onward. A plain nav visit (no `next`) always shows the editor.
  if (profile && next) {
    redirect(next);
  }

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <Card className="w-full max-w-lg shadow-md">
        <CardContent className="p-6 sm:p-8">
          <h1 className="mb-1 font-display text-lg font-bold text-foreground">
            {profile ? "Your profile" : "Complete your profile"}
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            {profile
              ? "Keep your details up to date."
              : "One quick step before you can reserve a room."}
          </p>
          <StudentProfileForm next={next ?? "/search"} profile={profile} />
          <div className="mt-6 border-t border-border pt-6"><GoogleAccountLink /></div>
        </CardContent>
      </Card>
    </div>
  );
}
