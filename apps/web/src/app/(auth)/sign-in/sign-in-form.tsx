"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/shell/wordmark";
import { signInUrl } from "@/lib/auth";

const ERROR_MESSAGES: Record<string, string> = {
  not_invited: "This account hasn't been invited yet — contact an administrator.",
  sign_in_failed: "Sign-in didn't complete. Please try again.",
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

        <a
          href={signInUrl("staff", next ?? undefined)}
          className="mt-4 block text-center text-xs font-semibold text-teal-700 underline-offset-4 hover:underline dark:text-teal-300"
        >
          Staff sign-in
        </a>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">
          By continuing you agree to our Terms & Data Handling under the Uganda Data Protection Act 2019
        </p>
      </CardContent>
    </Card>
  );
}
