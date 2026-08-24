import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets `next dev` be reached from a phone over Tailscale MagicDNS.
  allowedDevOrigins: ["*.ts.net"],
  async headers() {
    return [
      {
        // Our SSE route handlers set this per-response too; this rule covers
        // any proxy in front of `next start` that would otherwise buffer it.
        source: "/api/:path*/stream",
        headers: [{ key: "X-Accel-Buffering", value: "no" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
