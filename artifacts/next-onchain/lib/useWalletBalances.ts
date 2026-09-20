"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { erc20Abi, formatUnits, type Address } from "viem";

export type AssetSpec = { address: Address; symbol: string; decimals: number };

// Reads the connected wallet's raw ERC-20 balance for a set of underlying
// assets (e.g. USDC, WETH) directly from each token contract — independent
// of which vault is currently selected in the UI. This is what lets the
// idle-balance nudge notice "you're holding USDC that isn't earning
// anything" as soon as a wallet connects, not only once someone has already
// opened the deposit form for a specific vault.
export function useWalletBalances(address: Address | undefined, assets: readonly AssetSpec[]) {
  const publicClient = usePublicClient();
  const [balances, setBalances] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!address || !publicClient || assets.length === 0) {
      setBalances(null);
      return;
    }
    let cancelled = false;

    Promise.all(
      assets.map(async ({ address: tokenAddress, decimals }) => {
        try {
          const raw = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          });
          return [tokenAddress, Number(formatUnits(raw, decimals))] as const;
        } catch {
          return [tokenAddress, 0] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setBalances(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [address, publicClient, assets]);

  return { balances };
}
