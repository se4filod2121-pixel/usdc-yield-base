"use client";

import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { Avatar, Name } from "@coinbase/onchainkit/identity";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2rem",
        padding: "1.5rem",
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
          maxWidth: "22rem",
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
    </main>
  );
}
