import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Load these from node_modules at runtime instead of bundling them. Bundled `ws` loses
  // its optional `bufferutil` and fails with "b.mask is not a function" when the Neon
  // driver opens its WebSocket on Vercel.
  serverExternalPackages: ["ws", "@neondatabase/serverless"],
};

export default nextConfig;
