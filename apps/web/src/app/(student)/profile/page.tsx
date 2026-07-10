import type { Metadata } from "next";
import { redirect } from "next/navigation";

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
  // Only ever redirect within the app — reject absolute/protocol-relative
  // URLs so `next` can't be used as an open redirect.
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/search";
  const profile = await getStudentProfile();
  if (profile) {
    redirect(next);
  }

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <Card className="w-full max-w-md shadow-md">
        <CardContent className="p-6 sm:p-8">
          <h1 className="mb-1 font-display text-lg font-bold text-foreground">
            Complete your profile
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            One quick step before you can reserve a room.
          </p>
          <StudentProfileForm next={next} />
        </CardContent>
      </Card>
    </div>
  );
}
