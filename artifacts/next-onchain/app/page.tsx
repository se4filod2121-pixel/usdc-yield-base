"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useAccount, useChainId, useSwitchChain, useConnect, useDisconnect } from "wagmi";
import dynamic from "next/dynamic";
import { base } from "viem/chains";
import { useBasename } from "../lib/useBasename";
import { useLocale } from "../lib/LocaleContext";
import { useReferral } from "../lib/useReferral";
import { usePortfolio } from "../lib/usePortfolio";
import { loadHistory } from "../lib/txHistory";
import { VAULTS, VAULT_ADDRESSES, type VaultAddress } from "../lib/vaults";
import { useWalletBalances } from "../lib/useWalletBalances";

const EarnProvider = dynamic(
  () => import("@coinbase/onchainkit/earn").then((m) => ({ default: m.EarnProvider })),
  { ssr: false }
);
import type { Connector } from "wagmi";
import { CustomDepositPanel } from "./CustomDepositPanel";
import { CustomWithdrawPanel } from "./CustomWithdrawPanel";

type ApyMap = Record<VaultAddress, number | null>;
type TvlMap = Record<VaultAddress, number | null>;
type VaultMeta = { creator: string | null; timelockSec: number | null; feeRatio: number | null; apyHistory: number[] | null; assetAddress: `0x${string}` | null };
type VaultMetaMap = Record<VaultAddress, VaultMeta>;
const MAX_RETRIES = 3;
const PORTFOLIO_VAULT_SPECS = VAULTS.map((v) => ({ address: v.address, decimals: v.assetDecimals }));

function formatUsdCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "1.25rem",
  width: "100%",
  overflow: "hidden",
};

type VaultInfoResult = {
  apy: number | null;
  tvlUsd: number | null;
  creator: string | null;
  timelockSec: number | null;
  feeRatio: number | null;
  apyHistory: number[] | null;
  assetAddress: `0x${string}` | null;
};

const EMPTY_VAULT_INFO: VaultInfoResult = {
  apy: null, tvlUsd: null, creator: null, timelockSec: null, feeRatio: null, apyHistory: null, assetAddress: null,
};

async function fetchVaultInfo(address: string): Promise<VaultInfoResult> {
  try {
    const res = await fetch("/morpho-api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variables: { address } }),
    });
    if (!res.ok) return EMPTY_VAULT_INFO;
    const json = await res.json();
    const vault = json?.data?.vaultByAddress;
    const state = vault?.state;
    const netApy: number | undefined = state?.netApy;
    const totalAssetsUsd: number | undefined = state?.totalAssetsUsd;
    const creatorAddress: string | undefined = vault?.creatorAddress;
    const timelock: number | undefined = state?.timelock;
    const fee: number | undefined = state?.fee;
    const historyPoints: Array<{ x: number; y: number }> | undefined = vault?.historicalState?.netApy;
    const assetAddress: string | undefined = vault?.asset?.address;
    return {
      apy: typeof netApy === "number" ? netApy : null,
      tvlUsd: typeof totalAssetsUsd === "number" ? totalAssetsUsd : null,
      creator: typeof creatorAddress === "string" ? creatorAddress : null,
      timelockSec: typeof timelock === "number" ? timelock : null,
      feeRatio: typeof fee === "number" ? fee : null,
      apyHistory: Array.isArray(historyPoints) && historyPoints.length >= 2
        ? historyPoints.map((p) => p.y)
        : null,
      assetAddress: typeof assetAddress === "string" ? (assetAddress as `0x${string}`) : null,
    };
  } catch {
    return EMPTY_VAULT_INFO;
  }
}

function TokenLogo({ symbol, src, size = 34 }: { symbol: string; src?: string; size?: number }) {
  // No fallback to the USDC icon for a missing/broken src — this app now
  // lists vaults over more than one asset, so an image failure (or no icon
  // asset at all for a given token) falls straight to a neutral initials
  // badge instead of silently mislabeling e.g. a WETH vault with the USDC logo.
  const [failed, setFailed] = useState(!src);
  const circle: React.CSSProperties = {
    width: size, height: size, borderRadius: "50%",
    flexShrink: 0, display: "flex", alignItems: "center",
    justifyContent: "center", overflow: "hidden",
  };
  if (failed || !src) {
    return (
      <div style={{ ...circle, background: "linear-gradient(135deg,#2775CA,#1a5fa8)", fontSize: size * 0.28, fontWeight: 800, color: "#fff", letterSpacing: "0.02em" }} aria-label={symbol}>
        {symbol}
      </div>
    );
  }
  return (
    <div style={circle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={symbol} width={size} height={size} style={{ width: size, height: size, objectFit: "cover" }} onError={() => setFailed(true)} />
    </div>
  );
}

function connectorColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("coinbase")) return "#17B8D6";
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

function WalletModal({ isConnected, onClose }: { isConnected: boolean; onClose: () => void }) {
  const { t } = useLocale();
  const { connect, connectors, isPending, variables, error } = useConnect();
  const sheetRef = useRef<HTMLDivElement>(null);
  const hasInjectedProvider = typeof window !== "undefined" && !!(window as any).ethereum;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => { if (isConnected) onClose(); }, [isConnected, onClose]);

  const displayConnectors = connectors.filter((c) => {
    if (c.id === "injected") {
      if (!hasInjectedProvider) return false;
      const hasEip6963 = connectors.some((x) => x.id !== "injected" && x.type === "injected");
      return !hasEip6963;
    }
    return true;
  });

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      role="dialog" aria-modal="true" aria-labelledby="wc-modal-title"
    >
      <div ref={sheetRef} style={{
        background: "var(--surface)", borderRadius: "1.5rem 1.5rem 0 0", width: "100%", maxWidth: "30rem",
        padding: "1.25rem 1.25rem 2.5rem", boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
        display: "flex", flexDirection: "column", gap: "0.5rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 id="wc-modal-title" style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--text)", margin: 0 }}>
            {t("connectWalletTitle")}
          </h2>
          <button onClick={onClose} aria-label={t("close")} style={{
            background: "rgba(255,255,255,0.07)", border: "none", borderRadius: "50%",
            width: 32, height: 32, cursor: "pointer", color: "var(--muted)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem",
          }}>✕</button>
        </div>

        {displayConnectors.map((connector) => {
          const isThis = isPending && (variables?.connector as any)?.uid === connector.uid;
          return (
            <button key={connector.uid} onClick={() => connect({ connector })} disabled={isPending} style={{
              display: "flex", alignItems: "center", gap: "0.875rem", width: "100%", padding: "0.875rem 1rem",
              borderRadius: "0.875rem", border: "1.5px solid var(--border)",
              background: isThis ? "rgba(23,184,214,0.08)" : "transparent",
              cursor: isPending ? "default" : "pointer", textAlign: "left",
              transition: "background 0.15s, border-color 0.15s",
            }}>
              <ConnectorIcon connector={connector} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)" }}>{connector.name}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.1rem" }}>
                  {connector.id === "coinbaseWalletSDK" && t("connectorCoinbaseDesc")}
                  {connector.id === "walletConnect" && t("connectorWalletConnectDesc")}
                  {connector.type === "injected" && connector.id !== "injected" && t("connectorBrowserDesc")}
                  {connector.id === "injected" && t("connectorBrowserDesc")}
                </div>
              </div>
              {isThis ? (
                <span style={{
                  width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                  border: "2.5px solid rgba(23,184,214,0.3)", borderTopColor: "var(--accent)",
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

        {error && (
          <p style={{ fontSize: "0.8125rem", color: "#f87171", textAlign: "center", margin: "0.5rem 0 0", lineHeight: 1.5 }}>
            {error.message.includes("rejected") ? t("connectionCancelled") : error.message}
          </p>
        )}
      </div>
    </div>
  );
}

function SocialProofBar({ apys, tvls }: { apys: ApyMap; tvls: TvlMap }) {
  const { t } = useLocale();
  const [stats, setStats] = useState<{ depositors: number; totalUsdcDeposited: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setStats({ depositors: data.depositors ?? 0, totalUsdcDeposited: data.totalUsdcDeposited ?? 0 });
      })
      .catch(() => {
        if (!cancelled) setStats({ depositors: 0, totalUsdcDeposited: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing to show yet is worse than nothing at all for a trust signal —
  // a bare "0 users" line undercuts the exact confidence it's meant to build.
  if (!stats || stats.depositors === 0) return null;

  let weightedApySum = 0;
  let tvlSum = 0;
  for (const vault of VAULTS) {
    const apy = apys[vault.address];
    const tvl = tvls[vault.address];
    if (apy != null && tvl != null) {
      weightedApySum += apy * tvl;
      tvlSum += tvl;
    }
  }
  const avgApy = tvlSum > 0 ? weightedApySum / tvlSum : null;

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem 0.75rem",
      fontSize: "0.75rem", color: "var(--muted)", margin: "0.625rem 0 0", fontVariantNumeric: "tabular-nums",
    }}>
      <span>👥 {t("socialProofUsers", { count: stats.depositors })}</span>
      <span aria-hidden="true">·</span>
      <span>💰 {t("socialProofDeposited", { amount: formatUsdCompact(stats.totalUsdcDeposited) })}</span>
      {avgApy != null && (
        <>
          <span aria-hidden="true">·</span>
          <span>📈 {t("socialProofAvgApy", { apy: `${(avgApy * 100).toFixed(2)}%` })}</span>
        </>
      )}
    </div>
  );
}

function VaultPicker({ selected, apys, tvls, onSelect }: { selected: VaultAddress; apys: ApyMap; tvls: TvlMap; onSelect: (a: VaultAddress) => void }) {
  const { t } = useLocale();
  const [showAll, setShowAll] = useState(false);
  const best = Object.entries(apys).reduce<{ addr: string | null; v: number }>((acc, [addr, v]) => {
    if (v != null && v > acc.v) return { addr, v };
    return acc;
  }, { addr: null, v: -Infinity }).addr;

  // A vault reporting an exact 0% APY (not null/still-loading) currently has
  // no funds allocated to any market — real, not a bug, but showing a bare
  // "0.00%" reads as broken. Hide these by default; a visitor can still
  // reveal them, with a note explaining why the number is zero.
  const inactiveVaults = VAULTS.filter((v) => apys[v.address] === 0);
  const visibleVaults = showAll ? VAULTS : VAULTS.filter((v) => apys[v.address] !== 0);

  return (
    <div role="listbox" aria-label={t("selectVaultAria")} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "0.875rem 0.875rem 0.75rem" }}>
      {visibleVaults.map((vault) => {
        const isSelected = vault.address === selected;
        const isBest = vault.address === best;
        const apy = apys[vault.address];
        const apyLabel = apy === null ? "—" : `${(apy * 100).toFixed(2)}%`;
        const tvl = tvls[vault.address];
        return (
          <button key={vault.address} role="option" aria-selected={isSelected} onClick={() => onSelect(vault.address)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", padding: "0.7rem 0.875rem", borderRadius: "0.875rem",
              border: isSelected ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
              background: isSelected ? "linear-gradient(135deg, rgba(23,184,214,0.14), rgba(23,184,214,0.03))" : "transparent",
              boxShadow: isSelected ? "0 4px 18px rgba(23,184,214,0.2)" : "none",
              cursor: "pointer", textAlign: "left", gap: "0.625rem",
              transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: 0, flex: 1 }}>
              <TokenLogo symbol={vault.assetSymbol} src={vault.logo} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {vault.name}
                  </span>
                  {isBest && (
                    <span style={{
                      fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.03em",
                      color: "#4ade80", background: "rgba(74,222,128,0.12)",
                      border: "1px solid rgba(74,222,128,0.3)", borderRadius: "999px",
                      padding: "0.05rem 0.4rem", textTransform: "uppercase",
                    }}>{t("best")}</span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.25rem" }}>
                  <span style={{
                    display: "inline-block",
                    fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                    padding: "0.1rem 0.5rem", borderRadius: "999px",
                    background: "rgba(255,255,255,0.06)", color: "var(--muted)",
                  }}>
                    {vault.tag}
                  </span>
                  {tvl != null && (
                    <span style={{ fontSize: "0.68rem", color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                      {formatUsdCompact(tvl)} {t("tvlSuffix")}
                    </span>
                  )}
                </div>
                {apy === 0 && (
                  <p style={{ fontSize: "0.66rem", color: "#fb923c", margin: "0.3rem 0 0", lineHeight: 1.4 }}>
                    ⚠️ {t("vaultInactiveNote")}
                  </p>
                )}
              </div>
            </div>
            <div style={{
              flexShrink: 0,
              background: "rgba(74,222,128,0.12)",
              border: "1px solid rgba(74,222,128,0.25)",
              color: "#4ade80",
              borderRadius: "999px", padding: "0.2rem 0.625rem",
              fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.01em",
              minWidth: "4.75rem", textAlign: "center", fontVariantNumeric: "tabular-nums",
            }}>
              {apy === null ? (
                <span style={{ display: "inline-block", width: "3rem", height: "0.75em", borderRadius: 4, background: "rgba(74,222,128,0.15)", verticalAlign: "middle" }} />
              ) : `APY ${apyLabel}`}
            </div>
          </button>
        );
      })}
      {inactiveVaults.length > 0 && (
        <button onClick={() => setShowAll((s) => !s)} style={{
          background: "transparent", border: "none", cursor: "pointer",
          fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)",
          textDecoration: "underline", textUnderlineOffset: "0.15rem",
          padding: "0.25rem 0", alignSelf: "flex-start",
        }}>
          {showAll ? t("showActiveVaultsOnly") : t("showAllVaults", { count: inactiveVaults.length })}
        </button>
      )}
    </div>
  );
}

function WrongNetworkOverlay({ onSwitch, isPending }: { onSwitch: () => void; isPending: boolean }) {
  const { t } = useLocale();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "2rem 1.25rem", textAlign: "center" }}>
      <div style={{ width: "3rem", height: "3rem", borderRadius: "50%", background: "rgba(251,146,60,0.12)", border: "1.5px solid rgba(251,146,60,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <p style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.375rem" }}>{t("wrongNetworkTitle")}</p>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.55, margin: 0, maxWidth: "17rem" }}>
          {t("wrongNetworkBody", { network: t("baseMainnetLabel") })}
        </p>
      </div>
      <button onClick={onSwitch} disabled={isPending} style={{
        background: isPending ? "rgba(23,184,214,0.5)" : "var(--accent)",
        color: "#fff", border: "none", borderRadius: "0.75rem",
        padding: "0.75rem 2rem", fontSize: "0.9375rem", fontWeight: 700,
        cursor: isPending ? "default" : "pointer",
        width: "100%", maxWidth: "16rem", transition: "background 0.15s",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
      }}>
        {isPending ? (
          <><span style={{ display: "inline-block", width: "0.875rem", height: "0.875rem", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite" }} />{t("switching")}</>
        ) : t("switchToBase")}
      </button>
    </div>
  );
}

function IdentityHeader({ address, isOnBase }: { address: `0x${string}`; isOnBase: boolean }) {
  const { t } = useLocale();
  const { basename, avatar } = useBasename(address);
  const displayName = basename ?? `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", minWidth: 0, flex: 1 }}>
      <div style={{
        width: "2.25rem", height: "2.25rem", borderRadius: "50%", flexShrink: 0,
        overflow: "hidden", background: "rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" width={36} height={36} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: "var(--muted)" }}>
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75" />
            <path d="M4 20c0-3.5 3.5-6 8-6s8 2.5 8 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayName}
        </span>
        <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0 }}>
          {isOnBase ? t("baseMainnetLabel") : t("wrongNetworkLabel")}
        </p>
      </div>
    </div>
  );
}

function AppIcon({ size = "3.25rem" }: { size?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
      style={{ flexShrink: 0, filter: "drop-shadow(0 4px 22px rgba(23,184,214,0.4))" }}
    >
      <defs>
        <linearGradient id="appIconGradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1652F0" />
          <stop offset="55%" stopColor="#17B8D6" />
          <stop offset="100%" stopColor="#A8E62B" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15.5" fill="#11181c" />
      <circle cx="16" cy="16" r="12" fill="none" stroke="url(#appIconGradient)" strokeWidth="6.5" strokeLinecap="round" strokeDasharray="62 14" />
      <polyline points="10.5,19.5 14,15.5 17,17.7 21,12.5" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="12.5" r="2" fill="white" />
    </svg>
  );
}

// Shown for the first ~2s after load, over the real page (which renders
// underneath and continues loading — wallet/vault data isn't held up by
// this). A plain timed overlay rather than "wait for data" so it never
// hangs open if a vault fetch is slow, and never flashes bare/unstyled
// content before disappearing.
const SPLASH_DURATION_MS = 2000;
function SplashScreen({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem",
        background: "var(--bg)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.4s ease",
      }}
    >
      <AppIcon size="5.5rem" />
      <span style={{ fontSize: "1.125rem", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text)" }}>
        USDC Yield on Base
      </span>
    </div>
  );
}

function ApySparkline({ points }: { points: number[] }) {
  const width = 120;
  const height = 32;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - ((p - min) / range) * height).toFixed(1)}`)
    .join(" ");
  const trendingUp = points[points.length - 1] >= points[0];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {/* APY softening isn't a loss (principal is unaffected), so a downtrend
          uses the app's neutral accent rather than alarm red. */}
      <path d={path} fill="none" stroke={trendingUp ? "#4ade80" : "#17b8d6"} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VaultDetails({ meta, curatorUrl }: { meta: VaultMeta; curatorUrl: string }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  if (!meta.creator && meta.timelockSec == null && meta.feeRatio == null) return null;

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
        padding: "0.625rem 1.125rem", background: "transparent", border: "none", cursor: "pointer",
        fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)",
      }}>
        {t("vaultInfoToggle")}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: "0 1.125rem 0.875rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <p style={{ fontSize: "0.72rem", color: "var(--muted)", lineHeight: 1.5, margin: "0 0 0.15rem" }}>
            {t("vaultContinuousYield")}
          </p>
          {meta.apyHistory && (
            <div style={{ display: "flex", justifyContent: "center", padding: "0.25rem 0 0.4rem" }}>
              <ApySparkline points={meta.apyHistory} />
            </div>
          )}
          {meta.creator && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
              <span style={{ color: "var(--muted)" }}>{t("vaultCurator")}</span>
              <a href={`https://basescan.org/address/${meta.creator}`} target="_blank" rel="noopener noreferrer"
                style={{ color: "var(--text)", textDecoration: "underline", textUnderlineOffset: "0.15rem" }}>
                {meta.creator.slice(0, 6)}...{meta.creator.slice(-4)}
              </a>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
            <span style={{ color: "var(--muted)" }}>{t("vaultCuratorSite")}</span>
            <a href={curatorUrl} target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--text)", textDecoration: "underline", textUnderlineOffset: "0.15rem" }}>
              {curatorUrl.replace(/^https?:\/\//, "")}
            </a>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
            <span style={{ color: "var(--muted)" }}>🔒 {t("vaultAudits")}</span>
            <a href="https://github.com/morpho-org/metamorpho/tree/main/audits" target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--text)", textDecoration: "underline", textUnderlineOffset: "0.15rem" }}>
              OpenZeppelin, Cantina ↗
            </a>
          </div>
          {meta.timelockSec != null && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
              <span style={{ color: "var(--muted)" }}>{t("vaultTimelock")}</span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{Math.round(meta.timelockSec / 86400)}d</span>
            </div>
          )}
          {meta.feeRatio != null && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
              <span style={{ color: "var(--muted)" }}>{t("vaultProtocolFee")}</span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{(meta.feeRatio * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const REBALANCE_THRESHOLD = 0.005; // 0.5 percentage points of APY

// A pure suggestion, never an automatic transfer: it just points the vault
// picker at the better-yielding vault so the user can withdraw from their
// current one and deposit into the new one themselves, each its own signed
// transaction. Moving a user's funds without their explicit per-transaction
// confirmation is a trust line we deliberately don't cross.
function RebalanceSuggestion({ address, apys, onSwitchVault, refreshKey }: { address: `0x${string}`; apys: ApyMap; onSwitchVault: (addr: VaultAddress) => void; refreshKey: number }) {
  const { t } = useLocale();
  const { perVaultAssets } = usePortfolio(address, PORTFOLIO_VAULT_SPECS, refreshKey);

  if (!perVaultAssets) return null;

  // Only ever compares a held vault against other vaults of the SAME
  // underlying asset — a WETH vault's APY isn't a substitute for a USDC
  // vault's, so cross-asset "better yield" comparisons would be misleading,
  // not helpful.
  for (const held of VAULTS) {
    const heldAmount = perVaultAssets[held.address];
    const heldApy = apys[held.address];
    if (!heldAmount || heldAmount <= 0 || heldApy == null) continue;

    const better = VAULTS
      .filter((v) => v.assetSymbol === held.assetSymbol && v.address !== held.address)
      .reduce<{ address: VaultAddress; name: string; apy: number } | null>((best, v) => {
        const apy = apys[v.address];
        if (apy == null) return best;
        if (!best || apy > best.apy) return { address: v.address, name: v.name, apy };
        return best;
      }, null);

    if (better && better.apy - heldApy >= REBALANCE_THRESHOLD) {
      return (
        <div style={{
          ...card, padding: "1rem 1.125rem", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: "0.75rem",
          background: "rgba(74,222,128,0.06)", borderColor: "rgba(74,222,128,0.25)",
        }}>
          <p style={{ fontSize: "0.8125rem", color: "var(--text)", lineHeight: 1.5, margin: 0 }}>
            {t("rebalanceSuggestionText", { vault: better.name, apy: `${(better.apy * 100).toFixed(2)}%` })}
          </p>
          <button onClick={() => onSwitchVault(better.address)} style={{
            flexShrink: 0, background: "var(--accent)", color: "#fff", border: "none",
            borderRadius: "0.625rem", padding: "0.5rem 0.875rem", fontSize: "0.78rem", fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap",
          }}>
            {t("rebalanceSuggestionCta")}
          </button>
        </div>
      );
    }
  }

  return null;
}

const IDLE_BALANCE_THRESHOLD = 1; // ignore dust below this many units of the asset

// Detects USDC (or other listed-asset) sitting in the wallet that isn't
// earning anything and nudges the user toward the best-APY vault for that
// asset — a "cash sweep" suggestion, not an automatic sweep: like
// RebalanceSuggestion, it only ever points at a vault, it never moves funds
// itself. Real automatic sweeping would need a session-key/ERC-4337
// permission grant and its own security review before it touches real
// balances without a fresh signature each time.
function IdleBalanceBanner({ address, apys, vaultInfos, onSwitchVault }: { address: `0x${string}`; apys: ApyMap; vaultInfos: VaultMetaMap; onSwitchVault: (addr: VaultAddress) => void }) {
  const { t } = useLocale();

  // Memoized on `vaultInfos` (only changes when a real data refresh lands,
  // not on every render) — useWalletBalances' effect keys off this array by
  // reference, so a fresh array on every render would re-fetch balances in
  // a tight loop.
  const assets = useMemo(
    () =>
      Array.from(
        VAULTS.reduce((map, v) => {
          const assetAddress = vaultInfos[v.address]?.assetAddress;
          if (assetAddress && !map.has(v.assetSymbol)) {
            map.set(v.assetSymbol, { address: assetAddress, symbol: v.assetSymbol, decimals: v.assetDecimals });
          }
          return map;
        }, new Map<string, { address: `0x${string}`; symbol: string; decimals: number }>())
      ).map(([, spec]) => spec),
    [vaultInfos]
  );

  const { balances } = useWalletBalances(address, assets);

  if (!balances) return null;

  for (const asset of assets) {
    const idle = balances[asset.address];
    if (!idle || idle < IDLE_BALANCE_THRESHOLD) continue;

    const best = VAULTS
      .filter((v) => v.assetSymbol === asset.symbol)
      .reduce<{ address: VaultAddress; name: string; apy: number } | null>((acc, v) => {
        const apy = apys[v.address];
        if (apy == null) return acc;
        if (!acc || apy > acc.apy) return { address: v.address, name: v.name, apy };
        return acc;
      }, null);

    if (!best) continue;

    return (
      <div style={{
        ...card, padding: "1rem 1.125rem", display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: "0.75rem",
        background: "rgba(23,184,214,0.06)", borderColor: "rgba(23,184,214,0.25)",
      }}>
        <p style={{ fontSize: "0.8125rem", color: "var(--text)", lineHeight: 1.5, margin: 0 }}>
          {t("idleBalanceText", {
            amount: idle.toLocaleString(undefined, { maximumFractionDigits: 2 }),
            symbol: asset.symbol,
            apy: `${(best.apy * 100).toFixed(2)}%`,
          })}
        </p>
        <button onClick={() => onSwitchVault(best.address)} style={{
          flexShrink: 0, background: "var(--accent)", color: "#fff", border: "none",
          borderRadius: "0.625rem", padding: "0.5rem 0.875rem", fontSize: "0.78rem", fontWeight: 700,
          cursor: "pointer", whiteSpace: "nowrap",
        }}>
          {t("idleBalanceCta")}
        </button>
      </div>
    );
  }

  return null;
}

function PortfolioSummary({ address, refreshKey }: { address: `0x${string}`; refreshKey: number }) {
  const { t } = useLocale();
  const { perVaultAssets } = usePortfolio(address, PORTFOLIO_VAULT_SPECS, refreshKey);

  const groups = perVaultAssets
    ? Array.from(
        VAULTS.reduce((map, v) => {
          const amount = perVaultAssets[v.address];
          if (!amount || amount <= 0) return map;
          const prev = map.get(v.assetSymbol) ?? { total: 0, count: 0 };
          map.set(v.assetSymbol, { total: prev.total + amount, count: prev.count + 1 });
          return map;
        }, new Map<string, { total: number; count: number }>())
      )
    : null;

  return (
    <div style={{ ...card, padding: "1.125rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <h2 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.01em", margin: 0, textTransform: "uppercase" }}>
        {t("portfolioHeading")}
      </h2>
      {groups == null ? (
        <div style={{ height: "1.5rem", width: "60%", borderRadius: 4, background: "rgba(255,255,255,0.06)" }} />
      ) : groups.length > 0 ? (
        groups.map(([symbol, { total, count }]) => (
          <p key={symbol} style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
            {t("portfolioValue", { amount: total.toLocaleString(undefined, { maximumFractionDigits: 4 }), count, symbol })}
          </p>
        ))
      ) : (
        <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: 0 }}>{t("portfolioEmpty")}</p>
      )}
    </div>
  );
}

function ReferralBlock({ address }: { address: `0x${string}` }) {
  const { t } = useLocale();
  const { referralCount, referralLink } = useReferral(address);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — not critical
    }
  }, [referralLink]);

  return (
    <div style={{ ...card, padding: "1.125rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      <div>
        <h2 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.25rem" }}>
          {t("referralShareTitle")}
        </h2>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
          {t("referralShareBody")}
        </p>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input readOnly value={referralLink ?? ""} onFocus={(e) => e.currentTarget.select()} style={{
          flex: 1, minWidth: 0, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
          borderRadius: "0.625rem", padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "var(--muted)",
        }} />
        <button onClick={handleCopy} disabled={!referralLink} style={{
          flexShrink: 0, background: "var(--accent)", color: "#fff", border: "none",
          borderRadius: "0.625rem", padding: "0.5rem 0.875rem", fontSize: "0.78rem", fontWeight: 700,
          cursor: referralLink ? "pointer" : "default", whiteSpace: "nowrap",
        }}>
          {copied ? t("referralLinkCopied") : t("referralCopyLink")}
        </button>
      </div>
      {referralCount > 0 && (
        <p style={{ fontSize: "0.72rem", color: "#4ade80", margin: 0 }}>
          {t("referralCountLabel", { count: referralCount })}
        </p>
      )}
    </div>
  );
}

function ReferralLeaderboard() {
  const { t } = useLocale();
  const [entries, setEntries] = useState<{ referrerAddress: string; count: number }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/referral/leaderboard")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setEntries(Array.isArray(data.leaderboard) ? data.leaderboard : []);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (entries != null && entries.length === 0) return null;

  return (
    <div style={{ ...card, padding: "1.125rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      <h2 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.01em", margin: 0, textTransform: "uppercase" }}>
        {t("referralLeaderboardHeading")}
      </h2>
      {entries == null ? (
        <div style={{ height: "1.25rem", width: "70%", borderRadius: 4, background: "rgba(255,255,255,0.06)" }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {entries.map((entry, i) => (
            <div key={entry.referrerAddress} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.78rem" }}>
              <span style={{ color: "var(--muted)" }}>
                #{i + 1} {entry.referrerAddress.slice(0, 6)}...{entry.referrerAddress.slice(-4)}
              </span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>
                {t("referralLeaderboardEntry", { count: entry.count })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function NotificationSubscribe() {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "invalid" | "error">("idle");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!EMAIL_RE.test(email)) {
        setStatus("invalid");
        return;
      }
      setStatus("submitting");
      try {
        const res = await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setStatus(res.ok ? "done" : "error");
      } catch {
        setStatus("error");
      }
    },
    [email]
  );

  if (status === "done") {
    return (
      <div style={{ ...card, padding: "1.125rem" }}>
        <p style={{ fontSize: "0.8125rem", color: "#4ade80", margin: 0, fontWeight: 600 }}>
          {t("notificationsSubscribed")}
        </p>
      </div>
    );
  }

  return (
    <div style={{ ...card, padding: "1.125rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      <div>
        <h2 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.25rem" }}>
          {t("notificationsHeading")}
        </h2>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
          {t("notificationsBody")}
        </p>
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
          placeholder={t("notificationsEmailPlaceholder")}
          style={{
            flex: 1, minWidth: 0, background: "rgba(255,255,255,0.05)",
            border: `1px solid ${status === "invalid" ? "#f87171" : "var(--border)"}`,
            borderRadius: "0.625rem", padding: "0.5rem 0.75rem", fontSize: "0.8125rem", color: "var(--text)",
          }}
        />
        <button type="submit" disabled={status === "submitting"} style={{
          flexShrink: 0, background: "var(--accent)", color: "#fff", border: "none",
          borderRadius: "0.625rem", padding: "0.5rem 0.875rem", fontSize: "0.78rem", fontWeight: 700,
          cursor: status === "submitting" ? "default" : "pointer", whiteSpace: "nowrap",
        }}>
          {t("notificationsSubscribe")}
        </button>
      </form>
      {status === "invalid" && (
        <p style={{ fontSize: "0.72rem", color: "#f87171", margin: 0 }}>{t("notificationsInvalidEmail")}</p>
      )}
    </div>
  );
}

const REMINDER_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

function DepositReminder({ address }: { address: `0x${string}` }) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const history = loadHistory(address);
    if (history.length === 0) return;
    const mostRecent = history[0].timestamp;
    if (Date.now() - mostRecent >= REMINDER_THRESHOLD_MS) setVisible(true);
  }, [address]);

  if (!visible) return null;

  return (
    <div style={{
      ...card, padding: "0.875rem 1.125rem", display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: "0.75rem",
      background: "rgba(251,146,60,0.08)", borderColor: "rgba(251,146,60,0.25)",
    }}>
      <p style={{ fontSize: "0.8125rem", color: "var(--text)", lineHeight: 1.5, margin: 0 }}>
        {t("reminderBannerText")}
      </p>
      <button onClick={() => setVisible(false)} aria-label={t("reminderDismiss")} style={{
        flexShrink: 0, background: "transparent", border: "none", color: "var(--muted)",
        cursor: "pointer", fontSize: "1rem", padding: "0.25rem",
      }}>✕</button>
    </div>
  );
}

export default function Home() {
  const { t } = useLocale();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const isOnBase = chainId === base.id;

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const closeModal = useCallback(() => setWalletModalOpen(false), []);

  const [selectedVault, setSelectedVault] = useState<VaultAddress>(VAULTS[0].address);
  const [apys, setApys] = useState<ApyMap>(
    () => Object.fromEntries(VAULT_ADDRESSES.map((a) => [a, null])) as ApyMap
  );
  const [tvls, setTvls] = useState<TvlMap>(
    () => Object.fromEntries(VAULT_ADDRESSES.map((a) => [a, null])) as TvlMap
  );
  const emptyVaultMeta: VaultMeta = { creator: null, timelockSec: null, feeRatio: null, apyHistory: null, assetAddress: null };
  const [vaultInfos, setVaultInfos] = useState<VaultMetaMap>(
    () => Object.fromEntries(VAULT_ADDRESSES.map((a) => [a, emptyVaultMeta])) as VaultMetaMap
  );
  const [earnKey, setEarnKey] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [permanentError, setPermanentError] = useState(false);
  const [depositTab, setDepositTab] = useState<"deposit" | "withdraw">("deposit");
  const [refreshTick, setRefreshTick] = useState(0);
  const earnCardRef = useRef<HTMLDivElement>(null);

  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  const loadVaultData = useCallback(() => {
    return Promise.all(VAULTS.map((v) => fetchVaultInfo(v.address).then((info) => ({ address: v.address, ...info }))))
      .then((results) => {
        setApys((prev) => {
          const next = { ...prev };
          for (const r of results) next[r.address] = r.apy;
          return next;
        });
        setTvls((prev) => {
          const next = { ...prev };
          for (const r of results) next[r.address] = r.tvlUsd;
          return next;
        });
        setVaultInfos((prev) => {
          const next = { ...prev };
          for (const r of results) next[r.address] = { creator: r.creator, timelockSec: r.timelockSec, feeRatio: r.feeRatio, apyHistory: r.apyHistory, assetAddress: r.assetAddress };
          return next;
        });
      });
  }, []);

  useEffect(() => {
    loadVaultData();
  }, [loadVaultData]);

  // Refetches every on-screen data source in place (vault APYs/TVLs/info,
  // wallet balances via refreshTick, and the deposit/withdraw panel's own
  // reads via earnKey) without a page reload, so the wallet stays connected.
  const handleRefresh = useCallback(() => {
    loadVaultData();
    setEarnKey((k) => k + 1);
    setRefreshTick((t) => t + 1);
  }, [loadVaultData]);

  // Triggers a refresh the first time the page is scrolled down a bit from
  // the top, then re-arms once the user scrolls back up to the top — this
  // reads scroll position after the browser has already handled the scroll,
  // so unlike a touch/pointer gesture it can never interfere with scrolling
  // itself. A cooldown keeps repeated up/down scrolling from hammering the
  // underlying Morpho API.
  useEffect(() => {
    const THRESHOLD = 40;
    const COOLDOWN_MS = 30_000;
    let armed = true;
    let lastTriggered = 0;

    function onScroll() {
      const y = window.scrollY;
      if (y <= 5) {
        armed = true;
        return;
      }
      if (!armed || y < THRESHOLD) return;
      armed = false;
      const now = Date.now();
      if (now - lastTriggered < COOLDOWN_MS) return;
      lastTriggered = now;
      handleRefresh();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [handleRefresh]);

  const handleVaultSelect = useCallback((addr: VaultAddress) => {
    setSelectedVault(addr);
    setEarnKey((k) => k + 1);
    setRetryCount(0);
    setPermanentError(false);
  }, []);

  // Selecting a vault that's already selected (the common case when the
  // idle-balance banner points at the default vault) changes no visible
  // state on its own — from a banner sitting above the fold, that reads as
  // "the button did nothing". Explicitly switch to the deposit tab and
  // scroll the earn card into view so the click always has a visible effect.
  const handleIdleBalanceDeposit = useCallback((addr: VaultAddress) => {
    handleVaultSelect(addr);
    setDepositTab("deposit");
    earnCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [handleVaultSelect]);

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
  const tvlValues = Object.values(tvls).filter((v): v is number => v != null);
  const totalTvlUsd = tvlValues.length === VAULTS.length ? tvlValues.reduce((a, b) => a + b, 0) : null;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <SplashScreen visible={showSplash} />

      <main style={{
        minHeight: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        gap: "1.125rem", padding: "2.25rem 1rem 4rem",
        background:
          "radial-gradient(circle at 20% 0%, rgba(22,82,240,0.14), transparent 50%)," +
          "radial-gradient(circle at 80% 10%, rgba(23,184,214,0.14), transparent 45%)," +
          "var(--bg)",
        width: "100%", maxWidth: "30rem", marginInline: "auto", boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.625rem", textAlign: "center", width: "100%" }}>
          <AppIcon />
          <h1 style={{ fontSize: "clamp(1.2rem,5vw,1.625rem)", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", margin: 0 }}>
            USDC Yield on Base
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--muted)", lineHeight: 1.6, maxWidth: "19rem", margin: 0 }}>
            {t("appTagline")}
          </p>
        </div>

        <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", padding: "1.25rem", gap: "0.75rem" }}>
          {isConnected && address ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "0.75rem" }}>
              <IdentityHeader address={address} isOnBase={isOnBase} />
              <button onClick={() => disconnect()} style={{
                flexShrink: 0, background: "rgba(255,255,255,0.06)", border: "1.5px solid var(--border)",
                borderRadius: "0.625rem", padding: "0.4rem 0.875rem",
                fontSize: "0.8125rem", fontWeight: 600, color: "var(--muted)",
                cursor: "pointer", whiteSpace: "nowrap",
              }}>{t("disconnect")}</button>
            </div>
          ) : (
            <button onClick={() => setWalletModalOpen(true)} style={{
              background: "var(--button-gradient)", color: "#fff", border: "none",
              borderRadius: "0.875rem", padding: "0.8125rem 2rem",
              fontSize: "0.9375rem", fontWeight: 700, cursor: "pointer",
              width: "100%", letterSpacing: "-0.01em",
              boxShadow: "0 4px 18px rgba(23,184,214,0.35)",
            }}>{t("connectWalletTitle")}</button>
          )}
        </div>

        {isConnected && address && (
          <>
            <DepositReminder address={address} />
            <IdleBalanceBanner address={address} apys={apys} vaultInfos={vaultInfos} onSwitchVault={handleIdleBalanceDeposit} />
            <RebalanceSuggestion address={address} apys={apys} onSwitchVault={handleVaultSelect} refreshKey={refreshTick} />
            <PortfolioSummary address={address} refreshKey={refreshTick} />
            <ReferralBlock address={address} />
            <ReferralLeaderboard />
          </>
        )}

        <div style={card} ref={earnCardRef}>
          <div style={{ padding: "1.125rem 1.125rem 0.875rem", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em", margin: 0 }}>
                {t("earnHeading")}
              </h2>
              {totalTvlUsd != null && (
                <span style={{
                  fontSize: "0.7rem", fontWeight: 700, color: "var(--text)",
                  background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
                  borderRadius: "999px", padding: "0.2rem 0.625rem", whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {formatUsdCompact(totalTvlUsd)} {t("tvlSuffix")}
                </span>
              )}
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
              {t("earnSubtitle")}
            </p>
            <SocialProofBar apys={apys} tvls={tvls} />
          </div>

          <div style={{ borderBottom: "1px solid var(--border)" }}>
            <VaultPicker selected={selectedVault} apys={apys} tvls={tvls} onSelect={handleVaultSelect} />
            <VaultDetails meta={vaultInfos[selectedVault]} curatorUrl={selectedMeta.curatorUrl} />
          </div>

          {showNetworkOverlay ? (
            <WrongNetworkOverlay onSwitch={() => switchChain({ chainId: base.id })} isPending={isSwitching} />
          ) : permanentError ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "1.5rem 1.125rem", textAlign: "center" }}>
              <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: 0 }}>
                {t("vaultLoadError", { name: selectedMeta.name })}
              </p>
              <button onClick={handleManualRetry} style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "0.625rem", padding: "0.625rem 1.5rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", width: "100%", maxWidth: "12rem" }}>
                {t("retry")}
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
                {(["deposit", "withdraw"] as const).map((tabKey) => (
                  <button key={tabKey} onClick={() => setDepositTab(tabKey)} style={{
                    flex: 1, padding: "0.875rem 0", border: "none", cursor: "pointer",
                    background: depositTab === tabKey ? "var(--accent)" : "transparent",
                    color: depositTab === tabKey ? "#fff" : "var(--muted)",
                    fontWeight: 700, fontSize: "0.9375rem",
                  }}>{tabKey === "deposit" ? t("tabDeposit") : t("tabWithdraw")}</button>
                ))}
              </div>
              {depositTab === "deposit" ? (
                <EarnProvider vaultAddress={selectedVault}>
                  <CustomDepositPanel vaultAddress={selectedVault} />
                </EarnProvider>
              ) : (
                <EarnProvider key={earnKey} vaultAddress={selectedVault} onError={handleEarnError}>
                  <CustomWithdrawPanel />
                </EarnProvider>
              )}
            </>
          )}
        </div>

        <NotificationSubscribe />

        <footer style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem 0", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--muted)" }}>
            <span>{t("builtOnBase")}</span>
            <span aria-hidden="true">·</span>
            <span>{t("poweredByMorpho")}</span>
            <span aria-hidden="true">·</span>
            <a
              href={`https://basescan.org/address/${selectedVault}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--muted)", textDecoration: "underline", textUnderlineOffset: "0.15rem" }}
            >
              {t("viewOnBasescan")}
            </a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.72rem", color: "var(--muted)" }}>
            <a href="/transparency" style={{ color: "var(--muted)", textDecoration: "underline", textUnderlineOffset: "0.15rem" }}>
              {t("transparencyLinkLabel")}
            </a>
            <span aria-hidden="true">·</span>
            <a href="/agent" style={{ color: "var(--muted)", textDecoration: "underline", textUnderlineOffset: "0.15rem" }}>
              {t("agentApiLinkLabel")}
            </a>
          </div>
          <p style={{ fontSize: "0.7rem", color: "var(--muted)", opacity: 0.7, maxWidth: "22rem", margin: 0, lineHeight: 1.5 }}>
            {t("disclaimer")}
          </p>
        </footer>
      </main>

      {walletModalOpen && (
        <WalletModal isConnected={isConnected} onClose={closeModal} />
      )}
    </>
  );
                                                }
