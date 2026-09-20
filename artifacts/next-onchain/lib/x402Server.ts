import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";

// Same wallet that already receives the 0.1% deposit fee (see
// app/api/deposits/route.ts and app/CustomDepositPanel.tsx) — one address
// for "money this app collects", rather than spinning up a second wallet to
// track and secure.
export const X402_PAY_TO = (process.env.X402_PAY_TO ||
  "0x39795b0eba8c9fc0c1d05e99daa4a9a799be1d31") as `0x${string}`;

// CAIP-2 network id. This app only ever runs against Base mainnet (see
// replit.md — there's no chain switching in the UI), so that's the default
// here too. Override to "eip155:84532" (Base Sepolia) for local development
// against a facilitator/wallet that only holds testnet USDC.
export const X402_NETWORK = (process.env.X402_NETWORK || "eip155:8453") as Network;

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
