import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Providers } from "@/components/providers";

import "./globals.css";
import "./learn.css";

export const metadata: Metadata = {
  title: "Drivechain Observatory · Learn drivechains live",
  description: "Learn BIP300 and BIP301 one concept at a time, with live data from eCash Betanet.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers><SiteHeader />{children}</Providers>
        <SiteFooter />
      </body>
    </html>
  );
}
