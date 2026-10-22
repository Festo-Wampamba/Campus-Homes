import { Suspense } from "react";
import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";

import "./public.css";

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="ch-public-shell">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <Suspense><SiteFooter /></Suspense>
    </div>
  );
}
