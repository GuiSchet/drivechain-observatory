import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StatusBanner } from "@/components/status-banner";
import { Providers } from "@/components/providers";
import { networks } from "@/lib/network";

import "./globals.css";
import "./learn.css";

export const metadata: Metadata = {
  title: "Drivechain Observatory · Learn drivechains live",
  description: "Learn BIP300 and BIP301 one concept at a time, with live data from eCash.",
};

const apiOrigins = [...new Set(networks.flatMap(n => { try { return [new URL(n.apiBaseUrl).origin]; } catch { return []; } }))];

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      {/* The browser opens the API connections (DNS, TCP, TLS) while the page's scripts load. The API is read with CORS and no credentials, hence anonymous. */}
      <head>{apiOrigins.map(origin => <link key={origin} rel="preconnect" href={origin} crossOrigin="anonymous"/>)}</head>
      <body>
        <Providers><SiteHeader /><StatusBanner />{children}</Providers>
        <SiteFooter />
      </body>
    </html>
  );
}
