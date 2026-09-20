import { X402_NETWORK, X402_PAY_TO } from "../../lib/x402Server";

export const metadata = {
  title: "Agent API — USDC Yield on Base",
  description: "x402-paid API for AI agents to find the best-yielding USDC vault on Base and get calldata to deposit into it.",
};

const codeBlock: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  padding: "0.875rem 1rem",
  fontSize: "0.78rem",
  overflowX: "auto",
  color: "var(--text)",
  whiteSpace: "pre",
};

const section: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "1.25rem",
  padding: "1.125rem",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "0.625rem",
};

export default function AgentApiPage() {
  return (
    <main style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "flex-start",
      gap: "1rem", padding: "2.25rem 1rem 4rem",
      background: "var(--bg)", width: "100%", maxWidth: "34rem", marginInline: "auto", boxSizing: "border-box",
    }}>
      <div style={{ width: "100%" }}>
        <a href="/" style={{ fontSize: "0.8125rem", color: "var(--muted)", textDecoration: "none" }}>← Back to app</a>
      </div>

      <div style={{ width: "100%" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.5rem" }}>
          Agent API
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
          Two <a href="https://x402.org" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)", textDecoration: "underline" }}>x402</a>-gated
          endpoints for AI agents/programmatic wallets to park idle USDC between tasks: one to find the best-yielding
          vault, one to get ready-to-sign calldata for depositing into it. Each call costs a fraction of a cent,
          paid per-request in USDC — no API key or account required. Both endpoints are non-custodial: they only ever
          return data or unsigned calldata, and never move funds or hold a key.
        </p>
      </div>

      <div style={section}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text)", margin: 0 }}>
          GET /api/agent/vaults — $0.001
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
          Live APY/TVL for every vault this app lists, plus the best-yielding vault per underlying asset.
        </p>
        <pre style={codeBlock}>{`{
  "network": "${X402_NETWORK}",
  "generatedAt": "2025-01-01T00:00:00.000Z",
  "vaults": [
    { "address": "0x...", "name": "Spark USDC", "curator": "Spark",
      "assetSymbol": "USDC", "assetDecimals": 6, "apy": 0.0512, "tvlUsd": 1234567 },
    ...
  ],
  "recommended": { "USDC": { "address": "0x...", "apy": 0.0512 }, "WETH": null }
}`}</pre>
      </div>

      <div style={section}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text)", margin: 0 }}>
          POST /api/agent/deposit-intent — $0.001
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
          Body: <code>{`{ "walletAddress": "0x...", "vaultAddress": "0x...", "amount": "100" }`}</code>
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
          Returns unsigned approve + deposit + platform-fee calls (net of the same 0.1% fee the app's own UI
          charges) for your agent&apos;s wallet to sign and broadcast itself — nothing here is executed for you.
        </p>
        <pre style={codeBlock}>{`{
  "vaultAddress": "0x...", "vaultName": "Spark USDC",
  "assetSymbol": "USDC", "assetDecimals": 6, "assetAddress": "0x...",
  "amount": "100", "feeAmount": "0.1", "netDepositAmount": "99.9",
  "calls": [
    { "to": "0x<asset>", "data": "0x<approve calldata>", "note": "..." },
    { "to": "0x<vault>", "data": "0x<deposit calldata>", "note": "..." },
    { "to": "0x<asset>", "data": "0x<fee transfer calldata>", "note": "..." }
  ]
}`}</pre>
      </div>

      <div style={section}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text)", margin: 0 }}>
          Paying with x402
        </h2>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
          Both routes respond <code>402 Payment Required</code> with x402 payment requirements
          (network <code>{X402_NETWORK}</code>, pay-to <code>{X402_PAY_TO}</code>) until your client attaches a
          valid payment. Use an <a href="https://x402.org" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)", textDecoration: "underline" }}>x402</a> client
          library (e.g. <code>@x402/core</code>&apos;s <code>x402HTTPClient</code>) with your agent&apos;s own EVM
          signer to handle the 402 → pay → retry flow automatically.
        </p>
      </div>

      <p style={{ fontSize: "0.72rem", color: "var(--muted)", opacity: 0.7, lineHeight: 1.5 }}>
        Not financial advice. Depositing into a Morpho vault carries smart-contract risk — your agent should do its
        own risk assessment before signing.
      </p>
    </main>
  );
}
