"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import { Earn } from "@coinbase/onchainkit/earn";
import { base } from "viem/chains";

/* ─── vault registry ─── */
const VAULTS = [
  {
    address: "0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A" as `0x${string}`,
    name: "Spark USDC",
    tag: "Spark",
  },
  {
    address: "0x616a4E1db48e22028f6bbf20444Cd3b8e3273738" as `0x${string}`,
    name: "Seamless USDC",
    tag: "Seamless",
  },
  {
    address: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183" as `0x${string}`,
    name: "Steakhouse USDC",
    tag: "Steakhouse",
  },
] as const;

type VaultAddress = (typeof VAULTS)[number]["address"];
type ApyMap = Record<VaultAddress, number | null>;

const MAX_RETRIES = 3;

/* ─── shared styles ─── */
const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "1.25rem",
  width: "100%",
  overflow: "hidden",
};

/* ─── fetch one vault's APY ─── */
async function fetchVaultApy(address: string): Promise<number | null> {
  try {
    const res = await fetch("/morpho-api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variables: { address } }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const netApy: number | undefined =
      json?.data?.vaultByAddress?.state?.netApy;
    return typeof netApy === "number" ? netApy : null;
  } catch {
    return null;
  }
}

/* ─── token logo with text fallback ─── */
function TokenLogo({ symbol, src }: { symbol: string; src: string }) {
  const [failed, setFailed] = useState(false);
  const SIZE = 34;
  const circleStyle: React.CSSProperties = {
    width: SIZE,
    height: SIZE,
    borderRadius: "50%",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };
  if (failed) {
    return (
      <div
        style={{
          ...circleStyle,
          background: "#2775CA",
          fontSize: "0.5rem",
          fontWeight: 800,
          color: "#fff",
          letterSpacing: "0.03em",
          textAlign: "center",
          lineHeight: 1,
        }}
        aria-label={symbol}
      >
        {symbol}
      </div>
    );
  }
  return (
    <div style={circleStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={symbol}
        width={SIZE}
        height={SIZE}
        style={{ width: SIZE, height: SIZE, objectFit: "cover" }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/* ─── vault picker ─── */
function VaultPicker({
  selected,
  apys,
  onSelect,
}: {
  selected: VaultAddress;
  apys: ApyMap;
  onSelect: (addr: VaultAddress) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Select vault"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        padding: "0.875rem 0.875rem 0.75rem",
      }}
    >
      {VAULTS.map((vault) => {
        const isSelected = vault.address === selected;
        const apy = apys[vault.address];
        const apyLabel = apy === null ? "—" : `${(apy * 100).toFixed(2)}%`;

        return (
          <button
            key={vault.address}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(vault.address)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "0.625rem 0.875rem",
              borderRadius: "0.75rem",
              border: isSelected
                ? "1.5px solid var(--accent)"
                : "1.5px solid var(--border)",
              background: isSelected
                ? "rgba(0, 82, 255, 0.08)"
                : "transparent",
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
              gap: "0.625rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                minWidth: 0,
                flex: 1,
              }}
            >
              <TokenLogo symbol="USDC" src="/usdc.svg" />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {vault.name}
                </div>
                <div
                  style={{
                    fontSize: "0.68rem",
                    color: "var(--muted)",
                    marginTop: "0.1rem",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    fontWeight: 500,
                  }}
                >
                  {vault.tag}
                </div>
              </div>
            </div>

            <div
              style={{
                flexShrink: 0,
                background: isSelected
                  ? "rgba(0, 82, 255, 0.18)"
                  : "rgba(255,255,255,0.06)",
                color: isSelected ? "#6e9eff" : "var(--muted)",
                borderRadius: "999px",
                padding: "0.2rem 0.625rem",
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.01em",
                minWidth: "4.75rem",
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {apy === null ? (
                <span
                  style={{
                    display: "inline-block",
                    width: "3rem",
                    height: "0.75em",
                    borderRadius: "4px",
                    background: "rgba(255,255,255,0.08)",
                    verticalAlign: "middle",
                  }}
                />
              ) : (
                `APY ${apyLabel}`
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─── wrong network overlay ──────────────────────────────────────────────────
   Shown inside the earn card area when the wallet is connected to a chain
   other than Base mainnet. Blocks deposit/withdraw until the user switches.
───────────────────────────────────────────────────────────────────────────── */
function WrongNetworkOverlay({
  onSwitch,
  isPending,
}: {
  onSwitch: () => void;
  isPending: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1rem",
        padding: "2rem 1.25rem",
        textAlign: "center",
      }}
    >
      {/* warning icon */}
      <div
        style={{
          width: "3rem",
          height: "3rem",
          borderRadius: "50%",
          background: "rgba(251, 146, 60, 0.12)",
          border: "1.5px solid rgba(251, 146, 60, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            stroke="#fb923c"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div>
        <p
          style={{
            fontSize: "0.9375rem",
            fontWeight: 700,
            color: "var(--text)",
            margin: "0 0 0.375rem",
          }}
        >
          Wrong Network
        </p>
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--muted)",
            lineHeight: 1.55,
            margin: 0,
            maxWidth: "17rem",
          }}
        >
          Deposits are only available on{" "}
          <strong style={{ color: "var(--text)" }}>Base mainnet</strong>.
          Switch your wallet to continue.
        </p>
      </div>

      <button
        onClick={onSwitch}
        disabled={isPending}
        style={{
          background: isPending ? "rgba(0,82,255,0.5)" : "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: "0.75rem",
          padding: "0.75rem 2rem",
          fontSize: "0.9375rem",
          fontWeight: 700,
          cursor: isPending ? "default" : "pointer",
          width: "100%",
          maxWidth: "16rem",
          transition: "background 0.15s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
        }}
      >
        {isPending ? (
          <>
            <span
              style={{
                display: "inline-block",
                width: "0.875rem",
                height: "0.875rem",
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.3)",
                borderTopColor: "#fff",
                animation: "spin 0.7s linear infinite",
              }}
            />
            Switching…
          </>
        ) : (
          "Switch to Base"
        )}
      </button>
    </div>
  );
}

/* ─── app icon ─── */
function AppIcon() {
  return (
    <div
      style={{
        width: "3.25rem",
        height: "3.25rem",
        borderRadius: "0.875rem",
        background: "var(--accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: "0 4px 20px rgba(0,82,255,0.35)",
      }}
    >
      <svg
        width="26"
        height="26"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <polyline
          points="4,24 10,16 15,19 22,11"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="22" cy="11" r="3" fill="white" />
      </svg>
    </div>
  );
}

/* ─── page ─── */
export default function Home() {
  /* wagmi hooks — must be inside WagmiProvider (provided by Providers wrapper) */
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const isOnBase = chainId === base.id;

  const [selectedVault, setSelectedVault] = useState<VaultAddress>(
    VAULTS[0].address
  );
  const [apys, setApys] = useState<ApyMap>({
    [VAULTS[0].address]: null,
    [VAULTS[1].address]: null,
    [VAULTS[2].address]: null,
  } as ApyMap);

  const [earnKey, setEarnKey] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [permanentError, setPermanentError] = useState(false);

  /* fetch all APYs in parallel on mount */
  useEffect(() => {
    Promise.all(
      VAULTS.map((v) =>
        fetchVaultApy(v.address).then((apy) => ({ address: v.address, apy }))
      )
    ).then((results) => {
      setApys((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.address] = r.apy;
        return next;
      });
    });
  }, []);

  const handleVaultSelect = useCallback((addr: VaultAddress) => {
    setSelectedVault(addr);
    setEarnKey((k) => k + 1);
    setRetryCount(0);
    setPermanentError(false);
  }, []);

  const handleEarnError = useCallback(
    (err: { message?: string }) => {
      console.error("[Earn] error:", err);
      if (retryCount < MAX_RETRIES) {
        const next = retryCount + 1;
        setRetryCount(next);
        setTimeout(() => setEarnKey((k) => k + 1), 1500 * next);
      } else {
        setPermanentError(true);
      }
    },
    [retryCount]
  );

  const handleManualRetry = useCallback(() => {
    setRetryCount(0);
    setPermanentError(false);
    setEarnKey((k) => k + 1);
  }, []);

  const selectedMeta = VAULTS.find((v) => v.address === selectedVault)!;

  /* show wrong-network overlay inside the earn card when connected but off-Base */
  const showNetworkOverlay = isConnected && !isOnBase;

  return (
    <>
      {/* keyframe for the switch spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <main
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: "1.125rem",
          padding: "2.25rem 1rem 4rem",
          background: "var(--bg)",
          width: "100%",
          maxWidth: "30rem",
          marginInline: "auto",
          boxSizing: "border-box",
        }}
      >
        {/* ── hero ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.625rem",
            textAlign: "center",
            width: "100%",
          }}
        >
          <AppIcon />
          <h1
            style={{
              fontSize: "clamp(1.2rem, 5vw, 1.625rem)",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text)",
              margin: 0,
            }}
          >
            USDC Yield on Base
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--muted)",
              lineHeight: 1.6,
              maxWidth: "19rem",
              margin: 0,
            }}
          >
            Connect your wallet and pick a vault to start earning.
          </p>
        </div>

        {/* ── wallet card ── */}
        <div
          style={{
            ...card,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "1.25rem",
          }}
        >
          <Wallet>
            <ConnectWallet>
              <Avatar className="h-6 w-6" />
              <Name />
            </ConnectWallet>
            <WalletDropdown>
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
        </div>

        {/* ── earn card ── */}
        <div style={card}>
          {/* card header */}
          <div
            style={{
              padding: "1.125rem 1.125rem 0.875rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <h2
              style={{
                fontSize: "0.9375rem",
                fontWeight: 700,
                color: "var(--text)",
                letterSpacing: "-0.01em",
                margin: "0 0 0.25rem",
              }}
            >
              Earn yield on your USDC
            </h2>
            <p
              style={{
                fontSize: "0.8125rem",
                color: "var(--muted)",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Choose a Morpho vault on Base and deposit USDC to earn yield.
            </p>
          </div>

          {/* vault picker — always visible so users can compare vaults */}
          <div style={{ borderBottom: "1px solid var(--border)" }}>
            <VaultPicker
              selected={selectedVault}
              apys={apys}
              onSelect={handleVaultSelect}
            />
          </div>

          {/* deposit / withdraw area */}
          {showNetworkOverlay ? (
            <WrongNetworkOverlay
              onSwitch={() => switchChain({ chainId: base.id })}
              isPending={isSwitching}
            />
          ) : permanentError ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1rem",
                padding: "1.5rem 1.125rem",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--muted)",
                  margin: 0,
                }}
              >
                Could not load vault data for {selectedMeta.name}. Deposit and
                Withdraw are still available — tap Retry to reload.
              </p>
              <button
                onClick={handleManualRetry}
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0.625rem",
                  padding: "0.625rem 1.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  width: "100%",
                  maxWidth: "12rem",
                }}
              >
                Retry
              </button>
              <Earn
                key={`fallback-${earnKey}`}
                vaultAddress={selectedVault}
                onError={handleEarnError}
                className="earn-full-width"
              />
            </div>
          ) : (
            <Earn
              key={earnKey}
              vaultAddress={selectedVault}
              onError={handleEarnError}
              className="earn-full-width"
            />
          )}
        </div>
      </main>
    </>
  );
}
