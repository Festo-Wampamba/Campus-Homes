import type { Metadata } from "next";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="flex w-full justify-center bg-muted px-4 py-12 sm:px-6 sm:py-20">
      <SignInForm />
    </div>
  );
}
