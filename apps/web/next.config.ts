import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  async rewrites() {
    const internalApiBase = process.env.API_INTERNAL_BASE ?? "http://api:3001/api";
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
