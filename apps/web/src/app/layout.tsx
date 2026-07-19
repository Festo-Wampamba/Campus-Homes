import type { Metadata, Viewport } from "next";
import { Open_Sans, Poppins } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";

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

export const metadata: Metadata = {
  title: {
    default: "CampusHomes — Verified student housing in Uganda",
    template: "%s · CampusHomes",
  },
  description:
    "Find hostels near your campus that our team has physically verified, and reserve your room with a 72-hour hold.",
};

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
      className={`${openSans.variable} ${poppins.variable} h-full`}
      // The no-FOUC script below adds `.dark` to this element before React
      // hydrates (it must run pre-paint to avoid a light-then-dark flash),
      // so the class list legitimately differs from what was server-rendered
      // — expected, not a bug, so don't let React warn about it.
      suppressHydrationWarning
    >
      <head>
        {/* Applies the persisted theme before first paint — avoids a
            light-then-dark flash. Kept in sync with ThemeToggle. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()",
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
