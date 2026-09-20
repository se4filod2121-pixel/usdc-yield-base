import { NextResponse } from "next/server";

const MORPHO_GRAPHQL = "https://blue-api.morpho.org/graphql";

// Diagnostic route for reading Morpho's real current response per vault —
// useful when investigating APY reports without a browser. Gated off by
// default (including in production) since it has no auth of its own;
// flip ENABLE_DEBUG_ENDPOINT=true in whichever environment needs it.
const VAULTS = [
  { address: "0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A", name: "Spark USDC" },
  { address: "0x616a4E1db48e22028f6bbf20444Cd3b8e3273738", name: "Seamless USDC" },
  { address: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183", name: "Steakhouse USDC" },
  { address: "0x27D8c7273fd3fcC6956a0B370cE5Fd4A7fc65c18", name: "Seamless WETH Vault" },
] as const;

async function fetchRaw(address: string) {
  const res = await fetch(MORPHO_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($address: String!) { vaultByAddress(address: $address, chainId: 8453) { name state { apy netApy netApyWithoutRewards fee totalAssetsUsd } } }`,
      variables: { address },
    }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

export async function GET() {
  if (process.env.ENABLE_DEBUG_ENDPOINT !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const results = await Promise.all(
    VAULTS.map(async (v) => ({ ...v, ...(await fetchRaw(v.address)) }))
  );
  return NextResponse.json(results);
}
