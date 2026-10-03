import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Montez, Open_Sans, Poppins } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";

import { Analytics } from "@/components/analytics";
import { CookieNotice } from "@/components/cookie-notice";
import { getSiteUrl } from "@/lib/site-url";

import { Providers } from "./providers";
import "./globals.css";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

// Brand typography, scoped to the marketing hero and editorial accents only
// — Poppins/Open Sans remain the high-legibility product UI pair everywhere
// else. Borrowed pairing (serif headline + script accent) from
// waybeyondtoursandtravel.com per Festo's request.
const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const montez = Montez({
  variable: "--font-montez",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const DESCRIPTION =
  "Compare student hostels near Makerere University that a CampusHomes inspector has visited in person. See rooms, prices and amenities, and reserve for free.";

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(await getSiteUrl()),
    title: {
      default: "CampusHomes | Inspected student hostels in Uganda",
      template: "%s · CampusHomes",
    },
    description: DESCRIPTION,
    openGraph: {
      type: "website",
      siteName: "CampusHomes",
      locale: "en_UG",
      description: DESCRIPTION,
    },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: "#008080",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${openSans.variable} ${poppins.variable} ${dmSerifDisplay.variable} ${montez.variable} h-full`}
      // The no-FOUC script below adds `.dark` to this element before React
      // hydrates (it must run pre-paint to avoid a light-then-dark flash),
      // so the class list legitimately differs from what was server-rendered
      // — expected, not a bug, so don't let React warn about it.
      suppressHydrationWarning
    >
      <head>
        {/* Light is the intentional default. Only an explicit saved dark
            choice is applied before first paint, avoiding a light-then-dark
            flash without letting OS preference override the product default. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()",
          }}
        />
      </head>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
          <CookieNotice />
          <Analytics />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
