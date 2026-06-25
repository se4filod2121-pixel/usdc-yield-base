"use client";

import { OnchainKitProvider } from "@coinbase/onchainkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base } from "viem/chains";
import { type ReactNode, useEffect, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const MORPHO_URL = "https://blue-api.morpho.org/graphql";
const MORPHO_PROXY = "/morpho-api";

// WalletConnect requires a free project ID from https://cloud.walletconnect.com
// Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in Replit Secrets to enable it.
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    // Coinbase Wallet (Smart Wallet + Coinbase extension)
    coinbaseWallet({ appName: "USDC Yield on Base" }),
    // EIP-6963 injected wallets: MetaMask, Trust Wallet extension, Rabby, Brave, etc.
    // Each installed wallet announces itself separately via EIP-6963, so all
    // installed wallets appear as individual options in the connect modal.
    injected(),
    // WalletConnect: mobile wallets via QR code (Trust Wallet, Rainbow, etc.)
    // Only active when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
    ...(wcProjectId ? [walletConnect({ projectId: wcProjectId, showQrModal: true })] : []),
  ],
  transports: { [base.id]: http() },
  ssr: true,
});

/* ─── Morpho fetch patch ─────────────────────────────────────────────────────
   Redirects OnchainKit's hardcoded Morpho URL to our /morpho-api proxy.
   Never throws under any circumstances — full try/catch at every level.
───────────────────────────────────────────────────────────────────────────── */
function MorphoFetchPatch() {
  useEffect(() => {
    const original = window.fetch.bind(window);

    window.fetch = function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      try {
        let url: string | undefined;
        try {
          if (typeof input === "string") {
            url = input;
          } else if (input instanceof URL) {
            url = input.href;
          } else if (
            input !== null &&
            typeof input === "object" &&
            typeof (input as Request).url === "string"
          ) {
            url = (input as Request).url;
          }
        } catch {
          return original(input, init);
        }

        if (url === MORPHO_URL) {
          let body: BodyInit | null | undefined;
          try {
            if (init?.body !== undefined) {
              body = init.body;
            } else if (input instanceof Request) {
              body = input.body as BodyInit;
            }
          } catch {
            body = undefined;
          }
          return original(MORPHO_PROXY, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
        }
      } catch {
        return original(input, init);
      }
      return original(input, init);
    };

    return () => {
      window.fetch = original;
    };
  }, []);

  return null;
}

/* ─── Global image fallback patch ───────────────────────────────────────────
   Replaces broken <img> elements anywhere in the DOM (including inside
   OnchainKit's internal components) with a styled circular badge — identical
   to the TokenLogo fallback used in the vault picker rows.
───────────────────────────────────────────────────────────────────────────── */
function ImageFallbackPatch() {
  useEffect(() => {
    function handleImageError(e: Event) {
      try {
        const img = e.target;
        if (!(img instanceof HTMLImageElement)) return;
        if (img.dataset.fallbackApplied) return;
        img.dataset.fallbackApplied = "true";

        const SIZE =
          img.offsetWidth || img.offsetHeight || img.width || img.height || 28;
        const label = img.alt ? img.alt.slice(0, 4).toUpperCase() : "$";
        const fontSize = Math.max(Math.round(SIZE * 0.32), 7);

        const badge = document.createElement("div");
        badge.setAttribute("aria-label", label);
        badge.setAttribute("role", "img");
        badge.style.cssText = [
          `width:${SIZE}px`,
          `height:${SIZE}px`,
          `min-width:${SIZE}px`,
          `border-radius:50%`,
          `background:#2775CA`,
          `display:inline-flex`,
          `align-items:center`,
          `justify-content:center`,
          `font-size:${fontSize}px`,
          `font-weight:800`,
          `color:#ffffff`,
          `letter-spacing:0.03em`,
          `flex-shrink:0`,
          `vertical-align:middle`,
          `font-family:Arial,sans-serif`,
          `line-height:1`,
          `text-align:center`,
          `user-select:none`,
        ].join(";");
        badge.textContent = label;
        img.replaceWith(badge);
      } catch {
        // Never surface a fallback error to the console.
      }
    }

    document.addEventListener("error", handleImageError, true);
    return () => document.removeEventListener("error", handleImageError, true);
  }, []);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 3,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
          },
        },
      })
  );

  return (
    // reconnectOnMount={false}: wagmi will NOT auto-reconnect a previously
    // connected wallet on page load. Users must explicitly click "Connect Wallet".
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={base}
        >
          <MorphoFetchPatch />
          <ImageFallbackPatch />
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
