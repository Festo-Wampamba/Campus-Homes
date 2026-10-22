import { Suspense } from "react";
import { SiteHeader } from "@/components/shell/site-header";
import { SiteFooter } from "@/components/shell/site-footer";
import "../(public)/public.css";
export default function AgreementLayout({children}:{children:React.ReactNode}) {
  return <div className="ch-public-shell min-h-dvh"><SiteHeader/><main className="mx-auto max-w-7xl px-4 sm:px-6">{children}</main><Suspense><SiteFooter/></Suspense></div>;
}
