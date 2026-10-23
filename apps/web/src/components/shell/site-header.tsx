import { headers } from "next/headers";

import { getServerSession } from "@/lib/session";
import { WORKSPACE_HOME } from "@/lib/auth-routing";
import { PublicHeader, type PublicHeaderLink } from "@/components/shell/public-header";

// Session-aware even on the marketing pages — a signed-in student browsing
// home/search/listing-detail must see that they're signed in, not just the
// portal pages (session.ts's getServerSession() is safe to call from any
// server component, same helper the portal layouts already use).
async function SiteHeader() {
  const session = await getServerSession();
  // Sign-in returns to the page it was opened from (the home page needs no next).
  const path = (await headers()).get("x-campushomes-path") ?? "/";
  const signInHref = path === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(path)}`;
  const hasLandlordAccess = session?.access.workspaces.includes("landlord") ?? false;
  const landlordLink: PublicHeaderLink = hasLandlordAccess
    ? { href: WORKSPACE_HOME.landlord, label: "Landlord" }
    : { href: "/landlords", label: "For landlords" };

  return (
    <PublicHeader
      isHome={path === "/"}
      signInHref={signInHref}
      landlordLink={landlordLink}
      session={session?.user ?? null}
      access={session?.access ?? null}
    />
  );
}

export { SiteHeader };
