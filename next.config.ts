import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rainbow-me/rainbowkit"],
  async redirects() {
    return [{ source: "/stable-swap", destination: "/swap", permanent: false }];
  },
};

export default nextConfig;
