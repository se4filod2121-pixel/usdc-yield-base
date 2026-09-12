"use client";

import { useEffect, useRef, useState } from "react";
import { isAddress, type Address } from "viem";

const PENDING_REFERRER_KEY = "onbase_pending_referrer";

// First-touch attribution: whichever ?ref= link a visitor arrives on first
// is the one that counts, even if they connect a wallet on a later visit.
// Read once at module load (client-only) rather than on every render.
function capturePendingReferrerFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const ref = new URL(window.location.href).searchParams.get("ref");
    if (ref && isAddress(ref) && !localStorage.getItem(PENDING_REFERRER_KEY)) {
      localStorage.setItem(PENDING_REFERRER_KEY, ref);
    }
  } catch {
    // URL parsing/localStorage unavailable — not critical, just skip capture
  }
}

type ReferralStatus = {
  referredBy: string | null;
  referralCount: number;
  discounted: boolean;
  referralLink: string | null;
};

export function useReferral(address: Address | undefined): ReferralStatus {
  const [status, setStatus] = useState<ReferralStatus>({
    referredBy: null,
    referralCount: 0,
    discounted: false,
    referralLink: null,
  });
  const registeredRef = useRef(false);

  useEffect(() => {
    capturePendingReferrerFromUrl();
  }, []);

  useEffect(() => {
    if (!address) return;
    const addr = address;
    let cancelled = false;

    async function sync() {
      try {
        const res = await fetch(`/api/referral?wallet=${addr}`);
        const data = await res.json();
        if (cancelled) return;

        if (!data.referredBy && !registeredRef.current) {
          const pending = localStorage.getItem(PENDING_REFERRER_KEY);
          if (pending && pending.toLowerCase() !== addr.toLowerCase()) {
            registeredRef.current = true;
            await fetch("/api/referral", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ referrer: pending, referred: addr }),
            }).catch(() => {});
            const retry = await fetch(`/api/referral?wallet=${addr}`);
            const retryData = await retry.json();
            if (!cancelled) {
              setStatus({
                referredBy: retryData.referredBy ?? null,
                referralCount: retryData.referralCount ?? 0,
                discounted: !!retryData.referredBy,
                referralLink: `${window.location.origin}${window.location.pathname}?ref=${addr}`,
              });
            }
            return;
          }
        }

        setStatus({
          referredBy: data.referredBy ?? null,
          referralCount: data.referralCount ?? 0,
          discounted: !!data.referredBy,
          referralLink: `${window.location.origin}${window.location.pathname}?ref=${addr}`,
        });
      } catch {
        if (!cancelled) {
          setStatus((prev) => ({ ...prev, referralLink: `${window.location.origin}${window.location.pathname}?ref=${addr}` }));
        }
      }
    }

    sync();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return status;
}
