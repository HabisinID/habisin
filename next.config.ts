import type { NextConfig } from "next";

const configuredBackend = process.env.BACKEND_URL?.trim();
if (process.env.VERCEL && !configuredBackend) {
  throw new Error(
    "Set BACKEND_URL to the public HTTPS Django origin in Vercel, then redeploy.",
  );
}
const backend = new URL(configuredBackend || "http://127.0.0.1:8000");
if (
  !["http:", "https:"].includes(backend.protocol) ||
  backend.pathname !== "/" ||
  backend.search ||
  backend.hash ||
  backend.username ||
  backend.password
) {
  throw new Error(
    "BACKEND_URL must be an HTTP(S) origin, without /api, credentials, query, or fragment.",
  );
}
if (
  process.env.VERCEL &&
  (backend.protocol !== "https:" ||
    ["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname))
) {
  throw new Error(
    "Vercel requires a public HTTPS BACKEND_URL, not a local development address.",
  );
}

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backend.origin}/api/:path*`,
      },
    ];
  },
};
export default nextConfig;
