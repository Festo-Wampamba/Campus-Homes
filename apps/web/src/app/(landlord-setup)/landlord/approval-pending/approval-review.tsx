"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import type { ApprovalStatus } from "./approval-status";
import { ReviewStamp } from "./review-stamp";
import { useApprovalStatus } from "./use-approval-status";

const OPEN_DASHBOARD_DELAY_MS = 1_200;

const COPY: Record<ApprovalStatus, { title: string; body: string }> = {
  pending: {
    title: "We're reviewing your application",
    body: "Our team is checking your details and documents. This page will open your dashboard automatically as soon as you're approved.",
  },
  verified: {
    title: "You're approved!",
    body: "Opening your dashboard…",
  },
  rejected: {
    title: "We couldn't verify your application",
    body: "The documents or information provided weren't clear enough. Please email our team at",
  },
};

export function ApprovalReview({ initialStatus }: { initialStatus: ApprovalStatus }) {
  const router = useRouter();
  const { status, hasTrouble } = useApprovalStatus(initialStatus);

  // Let the stamp land before leaving; entering /landlord mounts the
  // dashboard layout, whose KYC gate re-checks on the server.
  useEffect(() => {
    if (status !== "verified") return;
    const timer = setTimeout(() => router.replace("/landlord"), OPEN_DASHBOARD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, router]);

  const copy = COPY[status];
  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-teal-700 via-teal-800 to-teal-950 p-4 sm:p-8">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="flex flex-col items-center gap-5 p-7 text-center sm:p-10">
          <ReviewStamp status={status} />
          <div aria-live="polite">
            <h1 className="font-display text-xl font-bold text-foreground">{copy.title}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {copy.body}
              {status === "rejected" && (
                <>
                  {" "}
                  <a
                    href="mailto:support@campushomes.co.ug"
                    className="font-semibold text-primary underline underline-offset-2"
                  >
                    support@campushomes.co.ug
                  </a>{" "}
                  so we can help you complete your registration.
                </>
              )}
            </p>
          </div>
          {status === "pending" && (
            <p className="text-xs text-muted-foreground">
              {hasTrouble ? "We're having trouble checking your status. We'll keep trying." : "Checking for updates…"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
