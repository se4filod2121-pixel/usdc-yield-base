import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No ESLint config/dependency in this package; ignoring during builds avoids
  // Next.js prompting to interactively install ESLint in non-interactive CI.
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
