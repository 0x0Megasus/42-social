import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin uses Node.js-specific features (sockets, credentials).
  // Opt out of Server Components bundling so routes use native require —
  // otherwise Turbopack's bundled copy hangs multi-roundtrip ops
  // (e.g. RTDB transactions) while one-shot reads still pass.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
