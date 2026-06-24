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
    const original = window.fetch;

    window.fetch = function patchedFetch(input, init) {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : (input as Request).url;

      if (url === MORPHO_URL) {
        // Build a clean init with only plain ASCII headers so we never
        // trigger "String contains non ISO-8859-1 code point".
        const body =
          init?.body ??
          (input instanceof Request ? input.body : undefined);
        return original(MORPHO_PROXY, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      }
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
