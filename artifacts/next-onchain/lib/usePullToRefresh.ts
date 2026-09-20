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
//
// Built on Pointer Events rather than Touch Events: pointer events fire for
// touch, mouse-drag and pen alike, so the gesture also works with a mouse
// (desktop testing, trackpad drag) instead of silently doing nothing there.
export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const startY = useRef<number | null>(null);
  const activePointerId = useRef<number | null>(null);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (window.scrollY > 0 || refreshingRef.current) {
        startY.current = null;
        return;
      }
      startY.current = e.clientY;
      activePointerId.current = e.pointerId;
    }

    function onPointerMove(e: PointerEvent) {
      if (startY.current == null || e.pointerId !== activePointerId.current) return;
      const delta = e.clientY - startY.current;
      const next = delta > 0 ? Math.min(delta * 0.5, MAX_PULL) : 0;
      distanceRef.current = next;
      setPullDistance(next);
    }

    async function onPointerUp(e: PointerEvent) {
      if (startY.current == null || e.pointerId !== activePointerId.current) return;
      startY.current = null;
      activePointerId.current = null;
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

    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  return { pullDistance, refreshing, threshold: PULL_THRESHOLD };
}
