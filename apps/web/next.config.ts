import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // The CLI worker can lose captured stdout in some containerized Linux
    // environments. The compiler API performs the same build-time check.
    useTypeScriptCli: false,
  },
};

export default nextConfig;
