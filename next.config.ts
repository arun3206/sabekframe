import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/templates/**/*": ["./templates/**/*"],
    "/api/generations/**/*": ["./templates/**/*"],
  },
  outputFileTracingExcludes: {
    "/api/uploads/finalize": ["./node_modules/sharp/**/*", "./node_modules/@img/**/*"],
  },
};

export default nextConfig;
