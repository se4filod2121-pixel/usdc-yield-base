"use client";

import { OnchainKitProvider } from "@coinbase/onchainkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base } from "viem/chains";
import { type ReactNode, useEffect, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";

const MORPHO_URL = "https://blue-api.morpho.org/graphql";
const MORPHO_PROXY = "/morpho-api";

const wagmiConfig = createConfig({
  chains: [base],
  connectors: [coinbaseWallet({ appName: "OnchainKit App" }), injected()],
  transports: { [base.id]: http() },
  ssr: true,
});

/* ─── Morpho fetch patch ─────────────────────────────────────────────────────
   Intercepts OnchainKit's hardcoded Morpho GraphQL URL and redirects it to our
   /morpho-api proxy. Never throws under any circumstances.
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
   OnchainKit renders token logos inside internal components (e.g. the vault
   info popover) that we cannot directly instrument with onError props.
   This patch listens for image load errors anywhere in the document via
   capture-phase event delegation, then replaces each broken <img> with a
   styled circular badge — identical to the TokenLogo fallback in page.tsx.

   Safety guarantees:
   - data-fallback-applied prevents double-processing the same element.
   - The entire handler is wrapped in try/catch so it can never throw.
   - Only HTMLImageElement targets are processed; everything else is ignored.
   - replaceWith() is no-op-safe if the element is no longer in the DOM.
───────────────────────────────────────────────────────────────────────────── */
function ImageFallbackPatch() {
  useEffect(() => {
    function handleImageError(e: Event) {
      try {
        const img = e.target;
        if (!(img instanceof HTMLImageElement)) return;

        // Prevent processing the same element twice.
        if (img.dataset.fallbackApplied) return;
        img.dataset.fallbackApplied = "true";

        // Derive a size from rendered dimensions, then explicit attributes,
        // then fall back to a sensible default.
        const SIZE =
          img.offsetWidth ||
          img.offsetHeight ||
          img.width ||
          img.height ||
          28;

        // Label: prefer alt text, fall back to "$" (the dollar symbol
        // is universally readable at very small sizes).
        const label = img.alt ? img.alt.slice(0, 4).toUpperCase() : "$";
        const fontSize = Math.max(Math.round(SIZE * 0.32), 7);

        const badge = document.createElement("div");
        badge.setAttribute("aria-label", label);
        badge.setAttribute("role", "img");

        // Mirror the TokenLogo fallback style exactly.
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
        // Never let a fallback failure surface as a console error.
      }
    }

    // Capture phase ensures we see the event before any other listener,
    // including React's synthetic event system.
    document.addEventListener("error", handleImageError, true);
    return () => {
      document.removeEventListener("error", handleImageError, true);
    };
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
    <WagmiProvider config={wagmiConfig}>
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
