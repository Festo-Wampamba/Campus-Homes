"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const redirectUrl = await signOut();
          // Navigate through Logto's end-session endpoint so logging out also
          // clears the provider SSO session. A client-side route change would
          // immediately reuse the previous identity on the next sign-in.
          window.location.assign(redirectUrl);
        } catch {
          setPending(false);
        }
      }}
    >
      <LogOut aria-hidden />
      Sign out
    </Button>
  );
}
