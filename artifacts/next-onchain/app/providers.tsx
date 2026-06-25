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

function MorphoFetchPatch() {
  useEffect(() => {
    const original = window.fetch.bind(window);

    window.fetch = function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      // Top-level try/catch: patchedFetch must never throw.
      // Any failure at any step falls back to the original fetch, untouched.
      try {
        // ── 1. Safely resolve the URL string ──────────────────────────────
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
          // URL extraction failed — pass through unchanged
          return original(input, init);
        }

        // ── 2. Only intercept the Morpho GraphQL endpoint ─────────────────
        if (url === MORPHO_URL) {
          // Safely read the body from either init or the Request object.
          // If anything throws, body stays undefined — the proxy will still work
          // because fetchMorphoApy always sends the address in the body.
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

          // Send only plain ASCII headers — no forwarded headers that could
          // contain non-ISO-8859-1 code points.
          return original(MORPHO_PROXY, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
        }
      } catch {
        // Outer catch: if anything above unexpectedly throws,
        // delegate to original fetch without any modification.
        return original(input, init);
      }

      // ── 3. Every other request: pass through completely untouched ─────────
      return original(input, init);
    };

    return () => {
      window.fetch = original;
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
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
