"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, useChainId, useSwitchChain, useConnect, useDisconnect } from "wagmi";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import dynamic from "next/dynamic";
import { base } from "viem/chains";

// Earn uses browser-only APIs that differ between SSR and client renders.
// ssr:false skips server-rendering entirely so there is nothing to hydrate against.
const Earn = dynamic(
  () => import("@coinbase/onchainkit/earn").then((m) => ({ default: m.Earn })),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: "2rem 1.25rem", textAlign: "center", color: "var(--muted)", fontSize: "0.875rem" }}>
        Loading vault…
      </div>
    ),
  }
);
import type { Connector } from "wagmi";
// (import must come after dynamic() call above — wagmi types are fine here)

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
    const netApy: number | undefined = json?.data?.vaultByAddress?.state?.netApy;
    return typeof netApy === "number" ? netApy : null;
  } catch {
    return null;
  }
}

/* ─── token logo with text fallback ─── */
function TokenLogo({ symbol, src }: { symbol: string; src: string }) {
  const [failed, setFailed] = useState(false);
  const SIZE = 34;
  const circle: React.CSSProperties = {
    width: SIZE, height: SIZE, borderRadius: "50%",
    flexShrink: 0, display: "flex", alignItems: "center",
    justifyContent: "center", overflow: "hidden",
  };
  if (failed) {
    return (
      <div style={{ ...circle, background: "#2775CA", fontSize: "0.5rem", fontWeight: 800, color: "#fff", letterSpacing: "0.03em" }} aria-label={symbol}>
        {symbol}
      </div>
    );
  }
  return (
    <div style={circle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={symbol} width={SIZE} height={SIZE} style={{ width: SIZE, height: SIZE, objectFit: "cover" }} onError={() => setFailed(true)} />
    </div>
  );
}

/* ─── connector icon ──────────────────────────────────────────────────────────
   Uses the wallet's own icon (data URL from EIP-6963 or WalletConnect SDK),
   with a coloured-initial badge as fallback.
───────────────────────────────────────────────────────────────────────────── */
function connectorColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("coinbase")) return "#0052FF";
  if (n.includes("metamask")) return "#E2761B";
  if (n.includes("walletconnect")) return "#3396FF";
  if (n.includes("trust")) return "#3375BB";
  if (n.includes("rainbow")) return "#174299";
  if (n.includes("brave")) return "#FB542B";
  return "#6B7280";
}

function ConnectorIcon({ connector }: { connector: Connector }) {
  const [imgFailed, setImgFailed] = useState(false);
  const icon = (connector as { icon?: string }).icon;
  if (icon && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={icon} alt={connector.name} width={40} height={40}
        style={{ borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
        onError={() => setImgFailed(true)} />
    );
  }
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
      background: connectorColor(connector.name),
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "1.125rem", fontWeight: 700, color: "#fff",
    }}>
      {connector.name.charAt(0).toUpperCase()}
    </div>
  );
}

/* ─── wallet modal (bottom sheet) ────────────────────────────────────────────
   Lists every connector wagmi knows about: Coinbase Wallet, injected wallets
   (MetaMask, Trust extension, etc. via EIP-6963), and WalletConnect.
   Closes automatically once the wallet connects.
───────────────────────────────────────────────────────────────────────────── */
function WalletModal({
  isConnected,
  onClose,
}: {
  isConnected: boolean;
  onClose: () => void;
}) {
  const { connect, connectors, isPending, variables, error } = useConnect();
  const sheetRef = useRef<HTMLDivElement>(null);

  /* close on Escape */
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* close when wallet connects successfully */
  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);

  /* deduplicate: hide the raw `injected` entry when EIP-6963 wallets are present */
  const displayConnectors = connectors.filter((c) => {
    if (c.id === "injected") {
      const hasEip6963 = connectors.some(
        (x) => x.id !== "injected" && x.type === "injected"
      );
      return !hasEip6963;
    }
    return true;
  });

  return (
    /* overlay */
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wc-modal-title"
    >
      {/* sheet */}
      <div
        ref={sheetRef}
        style={{
          background: "var(--surface)",
          borderRadius: "1.5rem 1.5rem 0 0",
          width: "100%",
          maxWidth: "30rem",
          padding: "1.25rem 1.25rem 2.5rem",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 id="wc-modal-title" style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--text)", margin: 0 }}>
            Connect Wallet
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "rgba(255,255,255,0.07)", border: "none", borderRadius: "50%",
              width: 32, height: 32, cursor: "pointer", color: "var(--muted)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem",
            }}
          >
            ✕
          </button>
        </div>

        {/* connector list */}
        {displayConnectors.map((connector) => {
          const isThis = isPending && (variables?.connector as any)?.uid === connector.uid;
          return (
            <button
              key={connector.uid}
              onClick={() => connect({ connector })}
              disabled={isPending}
              style={{
                display: "flex", alignItems: "center", gap: "0.875rem",
                width: "100%", padding: "0.875rem 1rem",
                borderRadius: "0.875rem",
                border: "1.5px solid var(--border)",
                background: isThis ? "rgba(0,82,255,0.08)" : "transparent",
                cursor: isPending ? "default" : "pointer",
                textAlign: "left",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              <ConnectorIcon connector={connector} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)" }}>
                  {connector.name}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.1rem" }}>
                  {connector.id === "coinbaseWalletSDK" && "Smart Wallet · Coinbase extension"}
                  {connector.id === "walletConnect" && "Scan QR with Trust, Rainbow & more"}
                  {connector.type === "injected" && connector.id !== "injected" && "Browser extension"}
                  {connector.id === "injected" && "Browser extension"}
                </div>
              </div>

              {isThis ? (
                <span style={{
                  width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                  border: "2.5px solid rgba(0,82,255,0.3)", borderTopColor: "var(--accent)",
                  display: "inline-block", animation: "spin 0.7s linear infinite",
                }} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, color: "var(--muted)" }}>
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}

        {/* connection error */}
        {error && (
          <p style={{ fontSize: "0.8125rem", color: "#f87171", textAlign: "center", margin: "0.5rem 0 0", lineHeight: 1.5 }}>
            {error.message.includes("rejected") ? "Connection cancelled." : error.message}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── vault picker ─── */
function VaultPicker({ selected, apys, onSelect }: { selected: VaultAddress; apys: ApyMap; onSelect: (a: VaultAddress) => void }) {
  return (
    <div role="listbox" aria-label="Select vault" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "0.875rem 0.875rem 0.75rem" }}>
      {VAULTS.map((vault) => {
        const isSelected = vault.address === selected;
        const apy = apys[vault.address];
        const apyLabel = apy === null ? "—" : `${(apy * 100).toFixed(2)}%`;
        return (
          <button key={vault.address} role="option" aria-selected={isSelected} onClick={() => onSelect(vault.address)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", padding: "0.625rem 0.875rem", borderRadius: "0.75rem",
              border: isSelected ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
              background: isSelected ? "rgba(0,82,255,0.08)" : "transparent",
              cursor: "pointer", textAlign: "left",
              transition: "border-color 0.15s, background 0.15s", gap: "0.625rem",
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: 0, flex: 1 }}>
              <TokenLogo symbol="USDC" src="/usdc.svg" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {vault.name}
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.1rem", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 500 }}>
                  {vault.tag}
                </div>
              </div>
            </div>
            <div style={{
              flexShrink: 0,
              background: isSelected ? "rgba(0,82,255,0.18)" : "rgba(255,255,255,0.06)",
              color: isSelected ? "#6e9eff" : "var(--muted)",
              borderRadius: "999px", padding: "0.2rem 0.625rem",
              fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.01em",
              minWidth: "4.75rem", textAlign: "center", fontVariantNumeric: "tabular-nums",
            }}>
              {apy === null ? (
                <span style={{ display: "inline-block", width: "3rem", height: "0.75em", borderRadius: 4, background: "rgba(255,255,255,0.08)", verticalAlign: "middle" }} />
              ) : `APY ${apyLabel}`}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─── wrong network overlay ─── */
function WrongNetworkOverlay({ onSwitch, isPending }: { onSwitch: () => void; isPending: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "2rem 1.25rem", textAlign: "center" }}>
      <div style={{ width: "3rem", height: "3rem", borderRadius: "50%", background: "rgba(251,146,60,0.12)", border: "1.5px solid rgba(251,146,60,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.375rem" }}>Wrong Network</p>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.55, margin: 0, maxWidth: "17rem" }}>
          Deposits are only available on <strong style={{ color: "var(--text)" }}>Base mainnet</strong>. Switch your wallet to continue.
        </p>
      </div>
      <button onClick={onSwitch} disabled={isPending}
        style={{
          background: isPending ? "rgba(0,82,255,0.5)" : "var(--accent)",
          color: "#fff", border: "none", borderRadius: "0.75rem",
          padding: "0.75rem 2rem", fontSize: "0.9375rem", fontWeight: 700,
          cursor: isPending ? "default" : "pointer",
          width: "100%", maxWidth: "16rem", transition: "background 0.15s",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
        }}>
        {isPending ? (
          <><span style={{ display: "inline-block", width: "0.875rem", height: "0.875rem", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite" }} />Switching…</>
        ) : "Switch to Base"}
      </button>
    </div>
  );
}

/* ─── app icon ─── */
function AppIcon() {
  return (
    <div style={{ width: "3.25rem", height: "3.25rem", borderRadius: "0.875rem", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 20px rgba(0,82,255,0.35)" }}>
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <polyline points="4,24 10,16 15,19 22,11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="22" cy="11" r="3" fill="white" />
      </svg>
    </div>
  );
}

/* ─── page ─── */
export default function Home() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const isOnBase = chainId === base.id;

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const closeModal = useCallback(() => setWalletModalOpen(false), []);

  const [selectedVault, setSelectedVault] = useState<VaultAddress>(VAULTS[0].address);
  const [apys, setApys] = useState<ApyMap>({ [VAULTS[0].address]: null, [VAULTS[1].address]: null, [VAULTS[2].address]: null } as ApyMap);
  const [earnKey, setEarnKey] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [permanentError, setPermanentError] = useState(false);

  /* fetch all APYs in parallel on mount */
  useEffect(() => {
    Promise.all(VAULTS.map((v) => fetchVaultApy(v.address).then((apy) => ({ address: v.address, apy }))))
      .then((results) => {
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

  const handleEarnError = useCallback((err: { message?: string }) => {
    console.error("[Earn] error:", err);
    if (retryCount < MAX_RETRIES) {
      const next = retryCount + 1;
      setRetryCount(next);
      setTimeout(() => setEarnKey((k) => k + 1), 1500 * next);
    } else {
      setPermanentError(true);
    }
  }, [retryCount]);

  const handleManualRetry = useCallback(() => {
    setRetryCount(0);
    setPermanentError(false);
    setEarnKey((k) => k + 1);
  }, []);

  const selectedMeta = VAULTS.find((v) => v.address === selectedVault)!;
  const showNetworkOverlay = isConnected && !isOnBase;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <main style={{
        minHeight: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        gap: "1.125rem", padding: "2.25rem 1rem 4rem",
        background: "var(--bg)", width: "100%", maxWidth: "30rem",
        marginInline: "auto", boxSizing: "border-box",
      }}>
        {/* ── hero ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.625rem", textAlign: "center", width: "100%" }}>
          <AppIcon />
          <h1 style={{ fontSize: "clamp(1.2rem,5vw,1.625rem)", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", margin: 0 }}>
            USDC Yield on Base
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--muted)", lineHeight: 1.6, maxWidth: "19rem", margin: 0 }}>
            Connect your wallet and pick a vault to start earning.
          </p>
        </div>

        {/* ── wallet card ── */}
        <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", padding: "1.25rem", gap: "0.75rem" }}>
          {isConnected && address ? (
            /* connected state */
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: 0 }}>
                <Avatar address={address} className="h-9 w-9" />
                <div style={{ minWidth: 0 }}>
                  <Name address={address} style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} />
                  <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0 }}>
                    {isOnBase ? "Base mainnet" : "Wrong network"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => disconnect()}
                style={{
                  flexShrink: 0, background: "rgba(255,255,255,0.06)", border: "1.5px solid var(--border)",
                  borderRadius: "0.625rem", padding: "0.4rem 0.875rem",
                  fontSize: "0.8125rem", fontWeight: 600, color: "var(--muted)",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            /* disconnected state */
            <button
              onClick={() => setWalletModalOpen(true)}
              style={{
                background: "var(--accent)", color: "#fff", border: "none",
                borderRadius: "0.875rem", padding: "0.8125rem 2rem",
                fontSize: "0.9375rem", fontWeight: 700, cursor: "pointer",
                width: "100%", letterSpacing: "-0.01em",
              }}
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* ── earn card ── */}
        <div style={card}>
          <div style={{ padding: "1.125rem 1.125rem 0.875rem", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em", margin: "0 0 0.25rem" }}>
              Earn yield on your USDC
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
              Choose a Morpho vault on Base and deposit USDC to earn yield.
            </p>
          </div>

          <div style={{ borderBottom: "1px solid var(--border)" }}>
            <VaultPicker selected={selectedVault} apys={apys} onSelect={handleVaultSelect} />
          </div>

          {showNetworkOverlay ? (
            <WrongNetworkOverlay onSwitch={() => switchChain({ chainId: base.id })} isPending={isSwitching} />
          ) : permanentError ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "1.5rem 1.125rem", textAlign: "center" }}>
              <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: 0 }}>
                Could not load vault data for {selectedMeta.name}. Tap Retry to reload.
              </p>
              <button onClick={handleManualRetry} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "0.625rem", padding: "0.625rem 1.5rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", width: "100%", maxWidth: "12rem" }}>
                Retry
              </button>
              <Earn key={`fallback-${earnKey}`} vaultAddress={selectedVault} onError={handleEarnError} className="earn-full-width" />
            </div>
          ) : (
            <Earn key={earnKey} vaultAddress={selectedVault} onError={handleEarnError} className="earn-full-width" />
          )}
        </div>
      </main>

      {/* ── wallet modal (portal-style, rendered outside main) ── */}
      {walletModalOpen && (
        <WalletModal isConnected={isConnected} onClose={closeModal} />
      )}
    </>
  );
} 
