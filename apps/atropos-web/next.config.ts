import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: [
    "@moirai/contracts",
    "@moirai/projections",
    "@moirai/publication"
  ],
  async rewrites() {
    return [{ source: "/__status", destination: "/status-public" }];
  }
};

export default nextConfig;
