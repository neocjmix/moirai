import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@moirai/contracts"],
  async rewrites() {
    return [{ source: "/__status", destination: "/status-public" }];
  }
};

export default nextConfig;
