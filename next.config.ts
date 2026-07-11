import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot
  },
  async rewrites() {
    return [
      { source: "/search", destination: "/v1/search" },
      { source: "/autocomplete", destination: "/v1/autocomplete" },
      { source: "/poi/:path*", destination: "/v1/poi/:path*" },
      { source: "/reverse-geocoding", destination: "/v1/reverse-geocoding" },
      { source: "/nearby-search", destination: "/v1/nearby-search" },
      { source: "/geocoding", destination: "/v1/geocoding" },
      { source: "/route", destination: "/v1/route" }
    ];
  }
};

export default nextConfig;
