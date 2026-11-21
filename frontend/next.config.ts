import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phones on the venue Wi-Fi (posting Stories) and tunnels must be allowed to load dev assets.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.trycloudflare.com", "*.ngrok-free.app"],
  // Keep Next's floating dev badge off the demo screen.
  devIndicators: false,
  // Same-origin proxy to the FastAPI backend, so a phone or tunnel only needs port 3000.
  // Fetch either `${NEXT_PUBLIC_API_URL}/api/...` (default http://localhost:8000) or just `/api/...`.
  async rewrites() {
    const backend = process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
