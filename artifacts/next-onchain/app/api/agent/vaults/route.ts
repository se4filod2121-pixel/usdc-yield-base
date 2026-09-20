import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { VAULTS } from "../../../../lib/vaults";
import { fetchAllVaultStates } from "../../../../lib/morphoServer";
import { getX402ResourceServer, X402_PAY_TO, X402_NETWORK } from "../../../../lib/x402Server";
import { rateLimit } from "../../../../lib/rateLimit";

// Machine-readable vault listing for AI agents / programmatic clients
// deciding where to park idle USDC between tasks. Paid via x402 (a few
// tenths of a cent) rather than free+rate-limited like the human-facing
// /morpho-api proxy: an agent calling this in a loop is exactly the traffic
// pattern x402 exists to meter, and the price is the rate limit.
async function handler(req: NextRequest) {
  const limited = rateLimit(req, { limit: 120, windowMs: 60_000, routeName: "agent-vaults" });
  if (limited) return limited;

  const liveStates = await fetchAllVaultStates();
  const byAddress = new Map(liveStates.map((s) => [s.address, s]));

  const vaults = VAULTS.map((v) => {
    const live = byAddress.get(v.address);
    return {
      address: v.address,
      name: v.name,
      curator: v.tag,
      curatorUrl: v.curatorUrl,
      assetSymbol: v.assetSymbol,
      assetDecimals: v.assetDecimals,
      apy: live?.apy ?? null,
      tvlUsd: live?.tvlUsd ?? null,
    };
  });

  // Best APY per underlying asset — a WETH vault's yield is never a
  // substitute recommendation for a USDC allocation, so this is grouped by
  // asset rather than a single blended "best vault" figure.
  const recommended: Record<string, { address: string; apy: number } | null> = {};
  for (const v of vaults) {
    if (v.apy == null) continue;
    const current = recommended[v.assetSymbol];
    if (!current || v.apy > current.apy) {
      recommended[v.assetSymbol] = { address: v.address, apy: v.apy };
    }
  }

  return NextResponse.json({
    network: X402_NETWORK,
    generatedAt: new Date().toISOString(),
    vaults,
    recommended,
  });
}

export const GET = withX402(
  handler,
  {
    accepts: {
      scheme: "exact",
      price: "$0.001",
      network: X402_NETWORK,
      payTo: X402_PAY_TO,
    },
    description: "Live APY/TVL for every USDC(/WETH) Morpho vault this app lists on Base, plus a per-asset best-yield recommendation.",
    mimeType: "application/json",
  },
  getX402ResourceServer(),
  undefined,
  undefined,
  // Don't validate the route/facilitator pairing at module load (build time,
  // cold start) — a facilitator hiccup or config mismatch would otherwise
  // take down `next build`/every route in this app, not just this one. The
  // same check still runs (and fails loudly) on the first real request.
  false,
);
