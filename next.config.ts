import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next.js doesn't pick up stray package-lock.json
  // files in parent directories.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
