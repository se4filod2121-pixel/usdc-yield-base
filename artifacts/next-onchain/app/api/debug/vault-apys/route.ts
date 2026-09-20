import { NextResponse } from "next/server";

const MORPHO_GRAPHQL = "https://blue-api.morpho.org/graphql";

// Temporary diagnostic route: lets us read Morpho's real current response
// for each tracked vault from outside this sandbox's blocked network,
// without needing a browser. Safe (read-only, no secrets) but meant to be
// removed once the 0% APY report is root-caused.
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
  const results = await Promise.all(
    VAULTS.map(async (v) => ({ ...v, ...(await fetchRaw(v.address)) }))
  );
  return NextResponse.json(results);
}
