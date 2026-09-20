"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { formatUnits, type Address } from "viem";

const vaultAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type PortfolioVaultSpec = { address: Address; decimals: number };

// Reads the connected wallet's live, current position directly from each
// vault contract (shares -> underlying asset value) rather than summing our
// own deposits log — the log has no record of withdrawals, so a simple sum
// of past deposits would overstate the real position. This is always the
// true current value, independent of anything our backend has recorded.
//
// Returns one amount per vault rather than a single blended total: this app
// lists vaults over more than one underlying asset (USDC, WETH, ...), and
// summing raw amounts across different assets/decimals would produce a
// meaningless number. Callers that want a total must first group by asset.
export function usePortfolio(address: Address | undefined, vaults: readonly PortfolioVaultSpec[]) {
  const publicClient = usePublicClient();
  const [perVaultAssets, setPerVaultAssets] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!address || !publicClient) {
      setPerVaultAssets(null);
      return;
    }
    let cancelled = false;

    Promise.all(
      vaults.map(async ({ address: vaultAddress, decimals }) => {
        try {
          const shares = await publicClient.readContract({
            address: vaultAddress,
            abi: vaultAbi,
            functionName: "balanceOf",
            args: [address],
          });
          if (shares === 0n) return [vaultAddress, 0] as const;
          const assets = await publicClient.readContract({
            address: vaultAddress,
            abi: vaultAbi,
            functionName: "convertToAssets",
            args: [shares],
          });
          return [vaultAddress, Number(formatUnits(assets, decimals))] as const;
        } catch {
          return [vaultAddress, 0] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setPerVaultAssets(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [address, publicClient, vaults]);

  return { perVaultAssets };
}
