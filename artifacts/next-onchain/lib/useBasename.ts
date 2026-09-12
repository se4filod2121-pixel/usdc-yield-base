"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";

type BasenameResult = { basename: string | null; avatar: string | null };

// Resolved server-side via /api/basename — see that route for why (mainly:
// a raw client-side fetch to a public Base RPC can be blocked or silently
// fail inside some wallets' in-app browsers, and the onchainkit version
// pinned in this app also hardcodes a stale, migrated-away-from resolver
// address).
export function useBasename(address?: Address) {
  const [result, setResult] = useState<BasenameResult>({ basename: null, avatar: null });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setResult({ basename: null, avatar: null });
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/basename?address=${address}`)
      .then((res) => res.json())
      .then((data: BasenameResult) => {
        if (!cancelled) setResult({ basename: data.basename ?? null, avatar: data.avatar ?? null });
      })
      .catch(() => {
        if (!cancelled) setResult({ basename: null, avatar: null });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  return { basename: result.basename, avatar: result.avatar, isLoading };
}
