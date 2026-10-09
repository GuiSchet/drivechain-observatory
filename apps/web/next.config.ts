import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
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
