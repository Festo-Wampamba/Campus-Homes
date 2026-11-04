import type { Metadata } from "next";
import Link from "next/link";
import { AccountTypeLinks } from "./account-type-links";
import { safeAuthDestination } from "@campushomes/shared";
import { SignInSurface } from "../sign-in/sign-in-surface";
import { SignInCard } from "@/components/sign-in-card";
import { Wordmark } from "@/components/shell/wordmark";
import { TermsNote } from "../sign-in/sign-in-form";

export const metadata: Metadata = { title: "Create an account" };
export default async function CreateAccountPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeAuthDestination((await searchParams).next);
  return <SignInSurface><SignInCard>
    <div className="mb-6 flex justify-center"><Wordmark stacked /></div>
    <h1 className="text-center text-2xl font-bold">Create your account</h1>
    <p className="mt-2 text-center text-sm text-muted-foreground">Choose how you want to use CampusHomes.</p>
    <AccountTypeLinks next={next} />
    <p className="mt-5 text-center text-sm">Already have an account? <Link href="/sign-in" className="font-semibold text-primary underline">Sign in</Link></p>
    <TermsNote />
  </SignInCard></SignInSurface>;
}
