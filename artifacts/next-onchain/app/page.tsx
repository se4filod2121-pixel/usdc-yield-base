"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import { Earn } from "@coinbase/onchainkit/earn";

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
type ApyMap = Record<VaultAddress, number | null>;   // null = loading / error

const MAX_RETRIES = 3;

/* ─── shared styles ─── */
const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "1.25rem",
  width: "100%",
  overflow: "hidden",
};

/* ─── fetch one vault's APY from our proxy ─── */
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
        padding: "1rem 1rem 0.75rem",
      }}
    >
      {VAULTS.map((vault) => {
        const isSelected = vault.address === selected;
        const apy = apys[vault.address];
        const apyLabel =
          apy === null ? "—" : `${(apy * 100).toFixed(2)}%`;

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
              padding: "0.75rem 1rem",
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
              gap: "0.5rem",
            }}
          >
            {/* left: name + protocol tag */}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: isSelected ? "var(--text)" : "var(--text)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {vault.name}
              </div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--muted)",
                  marginTop: "0.125rem",
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                }}
              >
                {vault.tag}
              </div>
            </div>

            {/* right: APY badge */}
            <div
              style={{
                flexShrink: 0,
                background: isSelected
                  ? "rgba(0, 82, 255, 0.18)"
                  : "rgba(255,255,255,0.06)",
                color: isSelected ? "#6e9eff" : "var(--muted)",
                borderRadius: "999px",
                padding: "0.2rem 0.625rem",
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.01em",
                minWidth: "4.5rem",
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

/* ─── page ─── */
export default function Home() {
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

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "1.25rem",
        padding: "2.5rem 1rem 3rem",
        background: "var(--bg)",
        width: "100%",
        maxWidth: "30rem",
        marginInline: "auto",
      }}
    >
      {/* ── hero ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.625rem",
          padding: "0 0.5rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "3rem",
            height: "3rem",
            borderRadius: "0.75rem",
            background: "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="10" stroke="white" strokeWidth="2" />
            <circle cx="11" cy="11" r="4" fill="white" />
          </svg>
        </div>
        <h1
          style={{
            fontSize: "clamp(1.2rem, 5vw, 1.625rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--text)",
          }}
        >
          Base Wallet
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--muted)",
            lineHeight: 1.6,
            maxWidth: "20rem",
          }}
        >
          Connect your wallet to get started on Base mainnet.
        </p>
      </div>

      {/* ── wallet card ── */}
      <div
        style={{
          ...card,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "1.5rem 1.25rem",
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
            padding: "1.25rem 1.25rem 1rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h2
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.01em",
              marginBottom: "0.25rem",
            }}
          >
            Earn yield on your USDC
          </h2>
          <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.5 }}>
            Choose a vault and deposit USDC to earn on-chain yield on Base.
          </p>
        </div>

        {/* vault picker */}
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <VaultPicker
            selected={selectedVault}
            apys={apys}
            onSelect={handleVaultSelect}
          />
        </div>

        {/* earn widget */}
        {permanentError ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
              padding: "1.75rem 1.25rem",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
              Vault data for {selectedMeta.name} couldn&apos;t be loaded.
              Deposit and Withdraw are still available — tap retry to reload.
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
  );
}
