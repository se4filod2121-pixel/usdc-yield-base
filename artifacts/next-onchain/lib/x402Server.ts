import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";

// Same wallet that already receives the 0.1% deposit fee (see
// app/api/deposits/route.ts and app/CustomDepositPanel.tsx) — one address
// for "money this app collects", rather than spinning up a second wallet to
// track and secure.
export const X402_PAY_TO = (process.env.X402_PAY_TO ||
  "0x39795b0eba8c9fc0c1d05e99daa4a9a799be1d31") as `0x${string}`;

// CAIP-2 network id. Defaults to Base Sepolia because the default facilitator
// below (the public x402.org one) does not support the "exact" scheme on
// Base *mainnet* ("eip155:8453") — confirmed by CI: `withX402` validates
// this pairing against the facilitator on first use and throws if
// unsupported. Override to "eip155:8453" only once X402_FACILITATOR_URL also
// points at a facilitator that actually settles mainnet USDC (e.g. one
// backed by `@coinbase/x402` + a CDP API key) — the rest of this app is
// Base-mainnet-only (see replit.md), but the agent API isn't until that pair
// is set together.
export const X402_NETWORK = (process.env.X402_NETWORK || "eip155:84532") as Network;

// The public x402.org facilitator is fine for development and for the
// price points these routes charge (fractions of a cent). Point this at a
// production facilitator (e.g. one backed by `@coinbase/x402` + a CDP API
// key) before relying on this for real revenue at scale.
export const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";

let cached: x402ResourceServer | null = null;

// A single resource server instance per Next.js server process — the same
// pattern as `lib/db`'s module-level `pool`/`db` singletons — so each
// x402-gated route doesn't re-create a facilitator client and re-register
// schemes on every request.
export function getX402ResourceServer(): x402ResourceServer {
  if (!cached) {
    const facilitatorClient = new HTTPFacilitatorClient({ url: X402_FACILITATOR_URL });
    cached = new x402ResourceServer(facilitatorClient).register(X402_NETWORK, new ExactEvmScheme());
  }
  return cached;
}
