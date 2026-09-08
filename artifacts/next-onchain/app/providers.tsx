"use client";
import { ErrorBoundary } from "./error-boundary";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { base } from "viem/chains";
import { Attribution } from "ox/erc8021";
import { type ReactNode, useEffect, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const MORPHO_URL = "https://blue-api.morpho.org/graphql";
const MORPHO_PROXY = "/morpho-api";

let _wagmiConfig: ReturnType<typeof createConfig> | null = null;

function buildWagmiConfig() {
  if (_wagmiConfig) return _wagmiConfig;

  const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

  _wagmiConfig = createConfig({
    chains: [base],
    connectors: [
      coinbaseWallet({ appName: "USDC Yield on Base" }),
      injected(),
      ...(wcProjectId
        ? [walletConnect({ projectId: wcProjectId, showQrModal: true })]
        : []),
    ],
    transports: { [base.id]: http() },
    dataSuffix: Attribution.toDataSuffix({ codes: ["bc_u6jkdbdd"] }),
    ssr: true,
  });

  return _wagmiConfig;
}

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
      }
    }

    document.addEventListener("error", handleImageError, true);
    return () => document.removeEventListener("error", handleImageError, true);
  }, []);

  return null;
}

function ErrorDebugPatch() {
  useEffect(() => {
    function showError(msg: string) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:99999;background:red;color:white;padding:16px;font-size:14px;white-space:pre-wrap;max-height:80vh;overflow:auto;";
      el.textContent = msg;
      document.body.appendChild(el);
    }
    window.addEventListener("error", (e) =>
      showError("ERROR: " + e.message + "\n" + (e.error?.stack || ""))
    );
    window.addEventListener("unhandledrejection", (e: any) =>
      showError("REJECTION: " + (e.reason?.message || e.reason) + "\n" + (e.reason?.stack || ""))
    );
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [wagmiConfig] = useState(buildWagmiConfig);

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
    <ErrorBoundary>
      <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
        <QueryClientProvider client={queryClient}>
          <OnchainKitProvider
            apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
            chain={base}
            config={{ paymaster: "https://onbase-finance.vercel.app/api/paymaster" }}
          >
            <ErrorDebugPatch />
            <MorphoFetchPatch />
            <ImageFallbackPatch />
            {children}
          </OnchainKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  );
                              }
