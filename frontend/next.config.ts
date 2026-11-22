import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: { agentUpgrade: "security" },
  // The file worker (src/lib/make-worker.mjs) is started by path at run time, so the bundler does not see it: carry it and what it imports into the standalone build.
  outputFileTracingIncludes: { "/api/v1/**": ["./src/lib/make-worker.mjs", "./src/lib/scenery.mjs", "./src/editor/**/*.mjs"] },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
};

export default nextConfig;
