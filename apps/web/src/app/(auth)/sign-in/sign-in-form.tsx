"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/shell/wordmark";
import { signInUrl } from "@/lib/auth";

const ERROR_MESSAGES: Record<string, string> = {
  not_invited: "This account hasn't been invited yet — contact an administrator.",
  sign_in_failed: "Sign-in didn't complete. Please try again.",
  sign_in_expired: "This sign-in attempt expired or was already used. Please start again.",
  auth_unavailable: "Authentication is temporarily unavailable. Please try again shortly.",
  account_mismatch: "Verification used a different account. Sign out, then continue with the same account.",
  identity_conflict: "Your verified contact matches conflicting CampusHomes records. Contact support and quote the request ID in the address bar.",
  mfa_required: "Staff access requires a completed multi-factor verification.",
  sso_logout_failed: "Your CampusHomes session ended, but provider sign-out could not be confirmed.",
};

export function SignInForm({ next, error }: { next: string | null; error?: string | null }) {
  return (
    <Card className="w-full max-w-sm shadow-xl">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-3 flex flex-col items-center gap-1 sm:mb-4">
          <Wordmark stacked />
        </div>

        <p className="mb-5 text-center text-sm text-muted-foreground">
          Sign in with your phone number, email, or Google.
        </p>

        {error && ERROR_MESSAGES[error] && (
          <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs text-destructive">
            {ERROR_MESSAGES[error]}
          </p>
        )}

        <a href={signInUrl("consumer", next ?? undefined)} className="block">
          <Button type="button" className="w-full gap-2">
            <ArrowRight aria-hidden className="size-4" />
            Continue
          </Button>
        </a>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">
          By continuing you agree to our Terms & Data Handling under the Uganda Data Protection Act 2019
        </p>
      </CardContent>
    </Card>
  );
}
