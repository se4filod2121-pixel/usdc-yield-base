"use client";

import { OnchainKitProvider } from "@coinbase/onchainkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base } from "viem/chains";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { createConfig, http } from "wagmi";
import { coinbaseWallet, metaMask } from "wagmi/connectors";

const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({ appName: "OnchainKit App" }),
    metaMask(),
  ],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={base}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
