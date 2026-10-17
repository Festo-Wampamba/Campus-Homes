"use client";

import { ArrowRightIcon } from "@radix-ui/react-icons";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/shell/wordmark";
import { signInUrl } from "@/lib/auth";

const ERROR_MESSAGES: Record<string, string> = {
  not_invited: "This account hasn't been invited yet. Contact an administrator.",
  sign_in_failed: "Sign-in didn't complete. Please try again.",
  sign_in_expired: "This sign-in attempt expired or was already used. Please start again.",
  auth_unavailable: "Authentication is temporarily unavailable. Please try again shortly.",
  identity_conflict: "Your verified contact matches conflicting CampusHomes records. Contact support and quote the request ID in the address bar.",
  mfa_required: "Staff accounts need 2-step verification. Sign in again: you will be asked to set up an authenticator app (such as Google Authenticator) before you can continue.",
  sso_logout_failed: "Your CampusHomes session ended, but provider sign-out could not be confirmed.",
};

export type SignInMode = "landlord-create" | "landlord-signin" | "all";

// The public landlords page sends exactly these two destinations; anything
// else keeps the full workspace chooser.
export function signInMode(next: string | null): SignInMode {
  if (next === "/landlords/enroll") return "landlord-create";
  if (next === "/landlord" || next?.startsWith("/landlord/")) return "landlord-signin";
  return "all";
}

export function ErrorNotice({ error }: { error?: string | null }) {
  if (!error || !ERROR_MESSAGES[error]) return null;
  return (
    <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs text-destructive">
      {ERROR_MESSAGES[error]}
    </p>
  );
}

export function TermsNote() {
  return (
    <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">
      By continuing you agree to our{" "}
      <Link href="/terms" className="font-semibold underline underline-offset-2">Terms</Link> and{" "}
      <Link href="/privacy" className="font-semibold underline underline-offset-2">Privacy policy</Link>.
    </p>
  );
}

function LandlordSignIn({ mode, next, error }: { mode: Exclude<SignInMode, "all">; next: string; error?: string | null }) {
  const creating = mode === "landlord-create";
  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-3 flex flex-col items-center gap-1 sm:mb-4">
          <Wordmark stacked />
        </div>
        <p className="mb-5 text-center text-sm text-muted-foreground">
          List and manage your properties on CampusHomes with a landlord account.
        </p>
        <ErrorNotice error={error} />
        <a href={creating ? signInUrl("consumer", "/landlords/enroll", "landlord", "register") : signInUrl("consumer", next, "landlord")} className="block">
          <Button type="button" className="w-full gap-2">
            <ArrowRightIcon aria-hidden />
            {creating ? "Create landlord account" : "Sign in to manage my properties"}
          </Button>
        </a>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {creating ? (
            <Link href="/sign-in?next=%2Flandlord" className="font-semibold text-primary underline-offset-2 hover:underline">
              Already have an account? Sign in
            </Link>
          ) : (
            <Link href="/sign-in?next=%2Flandlords%2Fenroll" className="font-semibold text-primary underline-offset-2 hover:underline">
              New landlord? Create an account
            </Link>
          )}
        </p>
        <TermsNote />
      </CardContent>
    </Card>
  );
}

export function SignInForm({ next, error }: { next: string | null; error?: string | null }) {
  const mode = signInMode(next);
  if (mode !== "all") return <LandlordSignIn mode={mode} next={next ?? "/landlord"} error={error} />;

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-3 flex flex-col items-center gap-1 sm:mb-4">
          <Wordmark stacked />
        </div>

        <p className="mb-5 text-center text-sm text-muted-foreground">
          Choose where you want to go. Your account determines which workspaces you can access.
        </p>

        <ErrorNotice error={error} />

        <a href={signInUrl("consumer", next ?? undefined, "student")} className="block">
          <Button type="button" className="w-full gap-2">
            <ArrowRightIcon aria-hidden />
            Student sign in
          </Button>
        </a>
        <a href={signInUrl("consumer", "/landlords/enroll", "landlord")} className="mt-3 block">
          <Button type="button" variant="secondary" className="w-full">Landlord sign in</Button>
        </a>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          New here?{" "}
          <a href={signInUrl("consumer", next ?? undefined, "student", "register")} className="font-semibold text-primary underline-offset-2 hover:underline">
            Create an account
          </a>
        </p>

        <TermsNote />
      </CardContent>
    </Card>
  );
}
