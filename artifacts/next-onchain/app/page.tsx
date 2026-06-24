"use client";

import { useState, useCallback } from "react";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { Avatar, Name } from "@coinbase/onchainkit/identity";
import { Earn } from "@coinbase/onchainkit/earn";

const SPARK_USDC_VAULT = "0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A";
const MAX_RETRIES = 3;

export default function Home() {
  const [earnKey, setEarnKey] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [permanentError, setPermanentError] = useState(false);

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

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: "2rem",
        padding: "3rem 1.5rem 4rem",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.75rem",
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
            fontSize: "clamp(1.25rem, 5vw, 1.75rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--text)",
            textAlign: "center",
          }}
        >
          Base Wallet
        </h1>
        <p
          style={{
            fontSize: "0.9rem",
            color: "var(--muted)",
            textAlign: "center",
            maxWidth: "22rem",
            lineHeight: 1.6,
          }}
        >
          Connect your wallet to get started on Base mainnet.
        </p>
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "1.25rem",
          padding: "2rem 1.75rem",
          width: "100%",
          maxWidth: "28rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem",
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

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "1.25rem",
          padding: "1.75rem",
          width: "100%",
          maxWidth: "28rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div style={{ marginBottom: "0.75rem" }}>
          <h2
            style={{
              fontSize: "1.05rem",
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.01em",
              marginBottom: "0.25rem",
            }}
          >
            Earn yield on your USDC
          </h2>
          <p
            style={{
              fontSize: "0.825rem",
              color: "var(--muted)",
              lineHeight: 1.5,
            }}
          >
            Deposit into the Spark USDC vault on Base and earn competitive
            on-chain yield.
          </p>
        </div>

        {permanentError ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
              padding: "2rem 1rem",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
              Vault data couldn&apos;t be loaded right now. Deposit and Withdraw
              are still available — tap retry to reload APY details.
            </p>
            <button
              onClick={handleManualRetry}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: "0.625rem",
                padding: "0.6rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
            <Earn
              key={`fallback-${earnKey}`}
              vaultAddress={SPARK_USDC_VAULT}
              onError={handleEarnError}
            />
          </div>
        ) : (
          <Earn
            key={earnKey}
            vaultAddress={SPARK_USDC_VAULT}
            onError={handleEarnError}
          />
        )}
      </div>
    </main>
  );
}
