import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local dev only: lets the dev server be reached via 127.0.0.1 (not just
  // localhost) without a same-origin warning — used when driving it with a
  // headless browser bound to that address.
  allowedDevOrigins: ["127.0.0.1"],
  // A self-contained `.next/standalone/server.js` plus only the
  // node_modules it actually traces as used — what the Docker image copies,
  // instead of the full node_modules tree. No effect on `npm run dev`.
  output: "standalone",
};

export default nextConfig;
