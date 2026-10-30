import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // DRF admin actions require a slash; workspace and cashier URLs do not.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/api/admin/:path*/",
        destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/api/admin/:path*/`,
      },
      {
        source: "/media/:path*",
        destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/media/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/api/:path*`,
      },
    ];
  },
};
export default nextConfig;
