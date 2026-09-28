import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Drivechain - Observatory",
  description: "Live, evidence-backed BIP300/301 observatory",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers><SiteHeader />{children}</Providers>
      </body>
    </html>
  );
}
