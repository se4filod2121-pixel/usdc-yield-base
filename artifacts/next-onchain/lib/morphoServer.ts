import { VAULTS, type VaultAddress } from "./vaults";

const MORPHO_GRAPHQL = "https://blue-api.morpho.org/graphql";

// Server-side counterpart of app/morpho-api/route.ts's proxy query, minus
// the historical-APY series — neither the transparency dashboard nor the
// agent API renders a sparkline, so there's no reason to pull 30 days of
// history on every request. Called directly from route handlers (not
// through our own /morpho-api proxy) since there's no browser/CORS boundary
// to cross here.
const QUERY = `query($address: String!) {
  vaultByAddress(address: $address, chainId: 8453) {
    address
    state {
      apy
      netApy
      totalAssetsUsd
    }
  }
}`;

export type VaultLiveState = {
  address: VaultAddress;
  apy: number | null;
  tvlUsd: number | null;
};

async function fetchOne(address: VaultAddress): Promise<VaultLiveState> {
  try {
    const res = await fetch(MORPHO_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { address } }),
      // Live APY/TVL move slowly enough that a short cache keeps this
      // endpoint cheap under repeated agent polling without going stale.
      next: { revalidate: 30 },
    });
    if (!res.ok) return { address, apy: null, tvlUsd: null };
    const json = await res.json();
    const state = json?.data?.vaultByAddress?.state;
    const netApy: number | undefined = state?.netApy;
    const totalAssetsUsd: number | undefined = state?.totalAssetsUsd;
    return {
      address,
      apy: typeof netApy === "number" ? netApy : null,
      tvlUsd: typeof totalAssetsUsd === "number" ? totalAssetsUsd : null,
    };
  } catch (err) {
    console.error(`[morphoServer] fetch failed for ${address}:`, err);
    return { address, apy: null, tvlUsd: null };
  }
}

export async function fetchAllVaultStates(): Promise<VaultLiveState[]> {
  return Promise.all(VAULTS.map((v) => fetchOne(v.address)));
}

const ASSET_QUERY = `query($address: String!) {
  vaultByAddress(address: $address, chainId: 8453) {
    asset { address }
  }
}`;

// Only the deposit-intent route needs this — the vault's own ERC-20
// approve() target isn't in `lib/vaults.ts`'s static config (it's the
// vault's *underlying asset*, not the vault itself) and isn't worth
// hardcoding a second time when Morpho already serves it.
export async function fetchVaultAssetAddress(address: VaultAddress): Promise<`0x${string}` | null> {
  try {
    const res = await fetch(MORPHO_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: ASSET_QUERY, variables: { address } }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const assetAddress = json?.data?.vaultByAddress?.asset?.address;
    return typeof assetAddress === "string" ? (assetAddress as `0x${string}`) : null;
  } catch (err) {
    console.error(`[morphoServer] asset address fetch failed for ${address}:`, err);
    return null;
  }
}
