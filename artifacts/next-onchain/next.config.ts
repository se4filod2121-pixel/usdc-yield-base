import type { NextConfig } from "next";

// Deliberately NOT setting X-Frame-Options/frame-ancestors here: this app is
// also loaded as a Base Mini App inside Coinbase Wallet/Base App's own
// client, which may render it in an iframe — a blanket frame-deny would
// break that embedding. Likewise no CSP `script-src`/`connect-src` lockdown
// yet: the wallet connectors (Coinbase Smart Wallet, WalletConnect, MetaMask
// SDK) each talk to their own set of relay/RPC origins, and getting that
// allowlist wrong would silently break real wallet connections — worse than
// not having the header. The headers below are the ones safe to add without
// live-testing every connector.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // No ESLint config/dependency in this package; ignoring during builds avoids
  // Next.js prompting to interactively install ESLint in non-interactive CI.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
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
