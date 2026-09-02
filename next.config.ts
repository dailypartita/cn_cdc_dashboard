import type { NextConfig } from "next";

const basePath = process.env.PAGES_BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

if (basePath) nextConfig.basePath = basePath;

export default nextConfig;
