import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "quickjs-emscripten-core",
    "@jitl/quickjs-singlefile-cjs-release-sync",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Origin-Agent-Cluster", value: "?1" },
          { key: "Permissions-Policy", value: "tools=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
