"use client";

import { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 70;
const MAX_PULL = 110;

// A custom pull-down gesture rather than relying on the browser's own
// pull-to-refresh: on mobile that does a real page navigation, which drops
// the wallet connection (wagmi's WagmiProvider is mounted with
// reconnectOnMount={false} on purpose, so a hard reload doesn't silently
// reconnect). This refetches in place instead, so the wallet stays
// connected throughout.
export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const startY = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0 || refreshingRef.current) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current == null) return;
      const delta = e.touches[0].clientY - startY.current;
      const next = delta > 0 ? Math.min(delta * 0.5, MAX_PULL) : 0;
      distanceRef.current = next;
      setPullDistance(next);
    }

    async function onTouchEnd() {
      if (startY.current == null) return;
      startY.current = null;
      if (distanceRef.current >= PULL_THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullDistance(PULL_THRESHOLD);
        try {
          await onRefreshRef.current();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          distanceRef.current = 0;
          setPullDistance(0);
        }
      } else {
        distanceRef.current = 0;
        setPullDistance(0);
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return { pullDistance, refreshing, threshold: PULL_THRESHOLD };
}
