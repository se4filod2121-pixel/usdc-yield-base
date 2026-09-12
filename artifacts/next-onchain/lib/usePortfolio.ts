"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { formatUnits, type Address } from "viem";

// Every vault this app lists is a USDC (6-decimal) ERC-4626 vault, so a
// fixed decimals count is safe here rather than needing per-vault token
// metadata just to render a portfolio total.
const USDC_DECIMALS = 6;

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

// Reads the connected wallet's live, current position directly from each
// vault contract (shares -> underlying USDC value) rather than summing our
// own deposits log — the log has no record of withdrawals, so a simple sum
// of past deposits would overstate the real position. This is always the
// true current value, independent of anything our backend has recorded.
export function usePortfolio(address: Address | undefined, vaultAddresses: readonly Address[]) {
  const publicClient = usePublicClient();
  const [totalAssets, setTotalAssets] = useState<number | null>(null);
  const [activeVaultCount, setActiveVaultCount] = useState(0);

  useEffect(() => {
    if (!address || !publicClient) {
      setTotalAssets(null);
      setActiveVaultCount(0);
      return;
    }
    let cancelled = false;

    Promise.all(
      vaultAddresses.map(async (vaultAddress) => {
        try {
          const shares = await publicClient.readContract({
            address: vaultAddress,
            abi: vaultAbi,
            functionName: "balanceOf",
            args: [address],
          });
          if (shares === 0n) return 0;
          const assets = await publicClient.readContract({
            address: vaultAddress,
            abi: vaultAbi,
            functionName: "convertToAssets",
            args: [shares],
          });
          return Number(formatUnits(assets, USDC_DECIMALS));
        } catch {
          return 0;
        }
      })
    ).then((amounts) => {
      if (cancelled) return;
      setTotalAssets(amounts.reduce((a, b) => a + b, 0));
      setActiveVaultCount(amounts.filter((a) => a > 0).length);
    });

    return () => {
      cancelled = true;
    };
  }, [address, publicClient, vaultAddresses]);

  return { totalAssets, activeVaultCount };
}
