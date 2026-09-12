"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { erc20Abi, parseUnits, encodeFunctionData, formatUnits } from "viem";
import {
  useEarnContext,
  buildDepositToMorphoTx,
} from "@coinbase/onchainkit/earn";
import { Transaction, TransactionButton } from "@coinbase/onchainkit/transaction";
import { computeFee } from "../lib/fee";
import {
  friendlyError,
  localizedMessage,
  PENDING_TIMEOUT_MS,
  PENDING_STATUS_NAMES,
} from "../lib/transactionStatus";

// Your wallet address — receives the 0.1% fee.
const FEE_RECIPIENT = "0x39795b0eba8c9fc0c1d05e99daa4a9a799be1d31" as `0x${string}`;

const HISTORY_KEY = "onbase_tx_history";
const MAX_HISTORY = 10;

type HistoryEntry = { hash: string; amount: string; symbol: string; timestamp: number };

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistoryEntry(entry: HistoryEntry) {
  try {
    const current = loadHistory();
    const next = [entry, ...current].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — silently skip, not critical
  }
}

export function CustomDepositPanel({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { vaultToken, apy, deposits, liquidity, walletBalance } = useEarnContext();
  const [amount, setAmount] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [transactionKey, setTransactionKey] = useState(0);
  const [showRetry, setShowRetry] = useState(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settledRef = useRef(false);

  const clearPendingWatchers = useCallback(() => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const resetTransaction = useCallback(() => {
    clearPendingWatchers();
    settledRef.current = false;
    setShowRetry(false);
    setErrorMessage(null);
    setIsProcessing(false);
    setTransactionKey((k) => k + 1);
  }, [clearPendingWatchers]);

  // Records a confirmed deposit exactly once, whichever of two paths detects
  // it first: OnchainKit's own onStatus("success"), or our independent
  // on-chain poll below (needed because onStatus has, in practice, gone
  // silent on a deposit that had already succeeded on-chain).
  const finalizeSuccess = useCallback(
    (hash: string, ctx: { amount: string; symbol: string; decimals: number; tokenAddress: `0x${string}`; walletAddress: `0x${string}`; vaultAddress: `0x${string}` }) => {
      if (settledRef.current) return;
      settledRef.current = true;
      clearPendingWatchers();
      setShowRetry(false);
      setErrorMessage(null);
      setIsProcessing(false);
      // Reset the <Transaction> tree so its button leaves whatever internal
      // state it was in (including a stuck spinner) and is ready for the
      // next deposit — safe now that we've already recorded this one.
      setTransactionKey((k) => k + 1);

      const entry: HistoryEntry = { hash, amount: ctx.amount, symbol: ctx.symbol, timestamp: Date.now() };
      saveHistoryEntry(entry);
      setHistory(loadHistory());
      setSuccessMessage(`${ctx.amount} ${ctx.symbol} başarıyla yatırıldı.`);

      const parsedAmount = parseUnits(ctx.amount, ctx.decimals);
      const feeAmount = computeFee(parsedAmount);

      fetch("/api/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: ctx.walletAddress,
          vaultAddress: ctx.vaultAddress,
          amount: ctx.amount,
          feeAmount: formatUnits(feeAmount, ctx.decimals),
          tokenSymbol: ctx.symbol,
          tokenAddress: ctx.tokenAddress,
          decimals: ctx.decimals,
          txHash: hash,
        }),
      }).catch((err) => console.error("[deposits] backend kayıt hatası:", err));

      setAmount("");
    },
    [clearPendingWatchers]
  );

  // Fallback for when the wallet has confirmed the batch but OnchainKit's
  // status callback never reports it: watch the vault contract directly for
  // a Transfer minting shares to this wallet, independent of the library.
  const startFallbackPoll = useCallback(() => {
    if (pollTimerRef.current || !publicClient || !address || !vaultToken) return;
    const ctx = {
      amount,
      symbol: vaultToken.symbol,
      decimals: vaultToken.decimals,
      tokenAddress: vaultToken.address as `0x${string}`,
      walletAddress: address,
      vaultAddress,
    };
    let attempts = 0;
    const MAX_ATTEMPTS = 36; // ~3 minutes at 5s
    publicClient.getBlockNumber().then((fromBlock) => {
      pollTimerRef.current = setInterval(async () => {
        attempts += 1;
        if (settledRef.current) return;
        try {
          const logs = await publicClient.getContractEvents({
            address: vaultAddress,
            abi: erc20Abi,
            eventName: "Transfer",
            args: { to: address },
            fromBlock,
            toBlock: "latest",
          });
          const mint = logs.find((log) => log.transactionHash);
          if (mint?.transactionHash) {
            finalizeSuccess(mint.transactionHash, ctx);
            return;
          }
        } catch (err) {
          console.error("[deposits] fallback poll hatası:", err);
        }
        if (attempts >= MAX_ATTEMPTS && pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }, 5000);
    });
  }, [publicClient, address, vaultToken, vaultAddress, amount, finalizeSuccess]);

  useEffect(() => {
    setHistory(loadHistory());
    return () => {
      clearPendingWatchers();
    };
  }, [clearPendingWatchers]);

  const buildCalls = useCallback(async () => {
    clearPendingWatchers();
    settledRef.current = false;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsProcessing(false);
    if (!address || !vaultToken || !amount || parseFloat(amount) <= 0) return [];

    if (walletBalance != null && parseFloat(amount) > parseFloat(walletBalance)) {
      setErrorMessage(friendlyError("insufficient balance"));
      return [];
    }

    const parsedAmount = parseUnits(amount, vaultToken.decimals);
    const feeAmount = computeFee(parsedAmount);
    const netDepositAmount = parsedAmount - feeAmount;

    // Official OnchainKit helper — builds the approve + deposit calls for the vault.
    const depositCalls = await buildDepositToMorphoTx({
      vaultAddress,
      tokenAddress: vaultToken.address as `0x${string}`,
      amount: netDepositAmount,
      recipientAddress: address,
    });

    // Our own extra call: a plain ERC-20 transfer of the fee, in the same
    // batched transaction/approval as the deposit.
    const feeCall = {
      to: vaultToken.address as `0x${string}`,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [FEE_RECIPIENT, feeAmount],
      }),
    };

    return feeAmount > 0n ? [...depositCalls, feeCall] : depositCalls;
  }, [address, amount, vaultToken, vaultAddress, walletBalance, clearPendingWatchers]);

  const handleStatus = useCallback((status: any) => {
    if (PENDING_STATUS_NAMES.has(status?.statusName)) {
      if (!pendingTimerRef.current) {
        setIsProcessing(true);
        pendingTimerRef.current = setTimeout(() => {
          pendingTimerRef.current = null;
          if (!settledRef.current) {
            setErrorMessage(localizedMessage("timeout"));
            setShowRetry(true);
          }
        }, PENDING_TIMEOUT_MS);
      }
      startFallbackPoll();
    } else if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }

    if (status?.statusName === "error") {
      clearPendingWatchers();
      setIsProcessing(false);
      const raw = status?.statusData?.message || status?.statusData?.error?.message || "";
      setErrorMessage(friendlyError(String(raw)));
      setShowRetry(false);
    }
    if (status?.statusName === "success" && vaultToken && address) {
      const hash = status?.statusData?.transactionReceipts?.[0]?.transactionHash;
      if (hash) {
        finalizeSuccess(hash, {
          amount,
          symbol: vaultToken.symbol,
          decimals: vaultToken.decimals,
          tokenAddress: vaultToken.address as `0x${string}`,
          walletAddress: address,
          vaultAddress,
        });
      }
    }
  }, [amount, vaultToken, address, vaultAddress, clearPendingWatchers, startFallbackPoll, finalizeSuccess]);

  if (!vaultToken) return null;

  const feeAmountPreview =
    amount && parseFloat(amount) > 0
      ? formatUnits(computeFee(parseUnits(amount, vaultToken.decimals)), vaultToken.decimals)
      : "0";

  return (
    <div style={{ padding: "1.125rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/usdc.svg" alt="" width={22} height={22} style={{ borderRadius: "50%", flexShrink: 0 }} />
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}>
            Deposit {vaultToken.symbol}
          </span>
        </div>
        <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
          APY {apy != null ? `${(apy * 100).toFixed(2)}%` : "—"}
        </span>
      </div>

      <input
        className="amount-input"
        inputMode="decimal"
        placeholder="0.0"
        value={amount}
        onChange={(e) => { setAmount(e.target.value); setErrorMessage(null); setSuccessMessage(null); setShowRetry(false); }}
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

      {isProcessing && !successMessage && !errorMessage && (
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", margin: "0 0 0.75rem", lineHeight: 1.5, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ width: "0.875rem", height: "0.875rem", flexShrink: 0, borderRadius: "50%", border: "2px solid rgba(0,82,255,0.25)", borderTopColor: "var(--accent)", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
          İşleminiz cüzdanınızda onaylanıyor ve zincire yazılıyor — bu birkaç saniyeden bir dakikaya kadar sürebilir.
        </p>
      )}

      {successMessage && (
        <p style={{ fontSize: "0.8125rem", color: "#4ade80", margin: "0 0 0.75rem", lineHeight: 1.5 }}>
          {successMessage}
        </p>
      )}

      {errorMessage && (
        <p style={{ fontSize: "0.8125rem", color: "#f87171", margin: "0 0 0.75rem", lineHeight: 1.5 }}>
          {errorMessage}
        </p>
      )}

      {showRetry && (
        <button
          type="button"
          onClick={resetTransaction}
          style={{
            width: "100%", boxSizing: "border-box", background: "transparent",
            border: "1.5px solid var(--border)", borderRadius: "0.875rem",
            padding: "0.625rem 1rem", fontSize: "0.8125rem", fontWeight: 600,
            color: "var(--text)", marginBottom: "0.75rem", cursor: "pointer",
          }}
        >
          Yeni bir işlem başlat
        </button>
      )}

      <Transaction key={transactionKey} calls={buildCalls} onStatus={handleStatus}>
        <TransactionButton text="Deposit" className="tx-button" />
      </Transaction>

      <p style={{ fontSize: "0.7rem", color: "var(--muted)", margin: "0.75rem 0 0" }}>
        Vault: {deposits ?? "—"} {vaultToken.symbol} total deposits · {liquidity ?? "—"} liquidity
      </p>

      {history.length > 0 && (
        <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border)", paddingTop: "0.875rem" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", margin: "0 0 0.5rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Son İşlemler
          </p>
          {history.map((h) => (
            <a
              key={h.hash}
              href={`https://basescan.org/tx/${h.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "0.5rem 0", textDecoration: "none", color: "var(--text)",
                fontSize: "0.8125rem", borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <span>{h.amount} {h.symbol} yatırıldı</span>
              <span style={{ color: "#6e9eff", fontSize: "0.75rem" }}>BaseScan ↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
