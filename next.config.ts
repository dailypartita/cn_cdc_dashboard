import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "*": ["./data/**/*"],
  },
  async redirects() {
    return [{ source: "/data", destination: "/csv", permanent: false }];
  },
};

export default nextConfig;
