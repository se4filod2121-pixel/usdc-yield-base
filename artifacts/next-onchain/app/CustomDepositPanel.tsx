"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { erc20Abi, parseUnits, encodeFunctionData, formatUnits } from "viem";
import {
  useEarnContext,
  buildDepositToMorphoTx,
} from "@coinbase/onchainkit/earn";
import { Transaction, TransactionButton } from "@coinbase/onchainkit/transaction";

// Your wallet address — receives the 0.1% fee.
const FEE_RECIPIENT = "0x39795b0eba8c9fc0c1d05e99daa4a9a799be1d31" as `0x${string}`;
// 10 basis points = 0.1% = 10/10000
const FEE_BPS = 10n;
const FEE_DENOMINATOR = 10000n;

export function CustomDepositPanel({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const { address } = useAccount();
  const { vaultToken, apy, deposits, liquidity, walletBalance } = useEarnContext();
  const [amount, setAmount] = useState("");

  const buildCalls = useCallback(async () => {
    if (!address || !vaultToken || !amount || parseFloat(amount) <= 0) return [];

    const parsedAmount = parseUnits(amount, vaultToken.decimals);
    const feeAmount = (parsedAmount * FEE_BPS) / FEE_DENOMINATOR;

    const depositCalls = await buildDepositToMorphoTx({
      vaultAddress,
      tokenAddress: vaultToken.address as `0x${string}`,
      amount: parsedAmount,
      recipientAddress: address,
    });

    const feeCall = {
      to: vaultToken.address as `0x${string}`,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [FEE_RECIPIENT, feeAmount],
      }),
    };

    return feeAmount > 0n ? [...depositCalls, feeCall] : depositCalls;
  }, [address, amount, vaultToken, vaultAddress]);

  if (!vaultToken) return null;

  const feeAmountPreview =
    amount && parseFloat(amount) > 0
      ? formatUnits((parseUnits(amount, vaultToken.decimals) * FEE_BPS) / FEE_DENOMINATOR, vaultToken.decimals)
      : "0";

  return (
    <div style={{ padding: "1.125rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}>
          Deposit {vaultToken.symbol}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
          APY {apy != null ? `${(apy * 100).toFixed(2)}%` : "—"}
        </span>
      </div>

      <input
        inputMode="decimal"
        placeholder="0.0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)",
          border: "1.5px solid var(--border)", borderRadius: "0.875rem",
          padding: "0.875rem 1rem", fontSize: "1.25rem", fontWeight: 600,
          color: "var(--text)", marginBottom: "0.5rem",
        }}
      />

      <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0 0 0.25rem" }}>
        Wallet balance: {walletBalance ?? "—"} {vaultToken.symbol}
      </p>
      <p style={{ fontSize: "0.7rem", color: "var(--muted)", margin: "0 0 1rem" }}>
        Includes a 0.1% platform fee ({feeAmountPreview} {vaultToken.symbol})
      </p>

      <Transaction calls={buildCalls}>
        <TransactionButton text="Deposit" />
      </Transaction>

      <p style={{ fontSize: "0.7rem", color: "var(--muted)", margin: "0.75rem 0 0" }}>
        Vault: {deposits ?? "—"} {vaultToken.symbol} total deposits · {liquidity ?? "—"} liquidity
      </p>
    </div>
  );
}
