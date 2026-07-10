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
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
