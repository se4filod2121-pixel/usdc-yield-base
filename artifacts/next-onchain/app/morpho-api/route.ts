import { NextRequest, NextResponse } from "next/server";

const MORPHO_GRAPHQL = "https://blue-api.morpho.org/graphql";

const CORRECTED_QUERY = `query($address: String!) {
  vaultByAddress(address: $address, chainId: 8453) {
    address
    symbol
    name
    creationBlockNumber
    creationTimestamp
    creatorAddress
    listed
    asset {
      id
      address
      decimals
      symbol
    }
    chain {
      id
      network
    }
    liquidity {
      underlying
    }
    state {
      apy
      netApy
      netApyWithoutRewards
      totalAssets
      totalAssetsUsd
      fee
      timelock
      rewards {
        supplyApr
        asset {
          address
          name
          decimals
        }
      }
    }
  }
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const variables = body?.variables ?? {};

    const upstream = await fetch(MORPHO_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: CORRECTED_QUERY, variables }),
    });

    const json = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(
        { errors: [{ message: "Upstream error", status: "UPSTREAM_ERROR" }] },
        { status: 502 }
      );
    }

    return NextResponse.json(json);
  } catch (err) {
    console.error("[morpho-api] proxy error:", err);
    return NextResponse.json(
      { errors: [{ message: "Proxy error", status: "PROXY_ERROR" }] },
      { status: 500 }
    );
  }
}
