import type { NextConfig } from "next";

/** The API origins the pages read (fetch and the live stream), from the same variables the build bakes in. */
function apiOrigins(): string[] {
  const urls: string[] = [];
  try {
    const list = JSON.parse(process.env.NEXT_PUBLIC_NETWORKS ?? "[]") as { apiBaseUrl?: string }[];
    if (Array.isArray(list)) urls.push(...list.map(n => n.apiBaseUrl ?? ""));
  } catch { /* lib/network.ts reports a malformed list at build time */ }
  urls.push(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8080");
  return [...new Set(urls.flatMap(u => { try { return [new URL(u).origin]; } catch { return []; } }))];
}

// Everything the site loads is its own: scripts, styles, fonts, images. It talks only to its APIs, and nobody may
// frame it. Next's hydration uses inline scripts, so script-src needs 'unsafe-inline' (nonces would force every page
// to render dynamically); the origin restrictions are what matter here.
const csp = [
  "default-src 'self'",
  // `next dev` evaluates code for hot reload; production builds never need eval.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigins().join(" ")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The technical views were replaced by the learning path; old links land on
  // the lesson or page that now covers the same data.
  async redirects() {
    return [
      ["/explorer", "/search"],
      ["/blocks", "/learn/blocks"],
      ["/pegs", "/learn/deposits"],
      ["/bmm", "/learn/merged-mining"],
      ["/proposals", "/learn/creating-a-sidechain"],
      ["/proposals/:id", "/learn/creating-a-sidechain"],
      ["/bundles/:id", "/learn/withdrawals"],
      ["/bundle-attempts/:id", "/learn/withdrawals"],
      ["/sidechain-instances/:id", "/sidechains"],
      ["/about/data", "/learn/how-we-know"],
    ].map(([source, destination]) => ({ source, destination, permanent: false }));
  },
  experimental: {
    // The CLI worker can lose captured stdout in some containerized Linux
    // environments. The compiler API performs the same build-time check.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
