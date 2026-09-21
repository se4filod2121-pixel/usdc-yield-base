"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import {
  useEarnContext,
  WithdrawAmountInput,
} from "@coinbase/onchainkit/earn";
import { Transaction, TransactionButton } from "@coinbase/onchainkit/transaction";
import { useLocale } from "../lib/LocaleContext";
import { formatHistoryTimestamp } from "../lib/format";
import { loadHistory, saveHistoryEntry, type HistoryEntry } from "../lib/txHistory";
import {
  friendlyError,
  localizedMessage,
  PENDING_TIMEOUT_MS,
  PENDING_STATUS_NAMES,
} from "../lib/transactionStatus";

// ERC-4626 maxWithdraw — the vault's own idle/available liquidity may be
// lower than what the user has deposited (funds lent out elsewhere), in
// which case a withdraw for the full deposited balance reverts on-chain
// even though the UI shows a healthy balance. We check this ourselves
// because OnchainKit's own "Use max" sets the full deposited balance
// regardless of what the vault can actually pay out right now.
const maxWithdrawAbi = [
  {
    type: "function",
    name: "maxWithdraw",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function CustomWithdrawPanel() {
  const { locale, t } = useLocale();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const {
    vaultAddress,
    vaultToken,
    apy,
    depositedBalance,
    withdrawAmount,
    setWithdrawAmount,
    withdrawCalls,
    withdrawAmountError,
    refetchDepositedBalance,
  } = useEarnContext();

  const [maxWithdrawable, setMaxWithdrawable] = useState<string | null>(null);

  useEffect(() => {
    if (!publicClient || !address || !vaultAddress || !vaultToken) {
      setMaxWithdrawable(null);
      return;
    }
    let cancelled = false;
    publicClient
      .readContract({ address: vaultAddress, abi: maxWithdrawAbi, functionName: "maxWithdraw", args: [address] })
      .then((raw) => {
        if (!cancelled) setMaxWithdrawable(formatUnits(raw, vaultToken.decimals));
      })
      .catch(() => {
        if (!cancelled) setMaxWithdrawable(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicClient, address, vaultAddress, vaultToken, depositedBalance]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionKey, setTransactionKey] = useState(0);
  const [showRetry, setShowRetry] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settledRef = useRef(false);
  const withdrawAmountRef = useRef(withdrawAmount);
  withdrawAmountRef.current = withdrawAmount;

  useEffect(() => {
    // No wallet connected — never show a previously connected wallet's
    // history to whoever is looking at the page now (same rule as
    // CustomDepositPanel).
    setHistory(address ? loadHistory(address) : []);
  }, [address]);

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

  // Records a confirmed withdrawal exactly once, whichever of two paths
  // detects it first: OnchainKit's own onStatus("success"), or our
  // independent on-chain poll below (the same OnchainKit <Transaction>
  // callback has, in practice, gone silent on a deposit that had already
  // succeeded on-chain — see CustomDepositPanel — so withdraw gets the same
  // safety net).
  const finalizeSuccess = useCallback(
    (hash: string, amount: string, symbol: string) => {
      if (settledRef.current) return;
      settledRef.current = true;
      clearPendingWatchers();
      setShowRetry(false);
      setErrorMessage(null);
      setIsProcessing(false);
      setSuccessMessage(t("withdrawSuccess", { amount, symbol }));
      setTransactionKey((k) => k + 1);
      setWithdrawAmount("");
      refetchDepositedBalance();

      if (address) {
        const entry: HistoryEntry = { hash, amount, symbol, timestamp: Date.now(), type: "withdraw" };
        saveHistoryEntry(address, entry);
        setHistory(loadHistory(address));
      }
    },
    [address, clearPendingWatchers, refetchDepositedBalance, setWithdrawAmount, t]
  );

  // Fallback for when the wallet has confirmed the withdrawal but
  // OnchainKit's status callback never reports it: watch the vault contract
  // directly for the Transfer that burns this wallet's shares.
  const startFallbackPoll = useCallback(() => {
    if (pollTimerRef.current || !publicClient || !address || !vaultToken || !vaultAddress) return;
    const amount = withdrawAmountRef.current;
    const symbol = vaultToken.symbol;
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // ~5 minutes at 5s — comfortably outlives PENDING_TIMEOUT_MS
    publicClient.getBlockNumber().then((fromBlock) => {
      pollTimerRef.current = setInterval(async () => {
        attempts += 1;
        if (settledRef.current) return;
        try {
          const logs = await publicClient.getContractEvents({
            address: vaultAddress,
            abi: erc20Abi,
            eventName: "Transfer",
            args: { from: address },
            fromBlock,
            toBlock: "latest",
          });
          const burn = logs.find((log) => log.transactionHash);
          if (burn?.transactionHash) {
            finalizeSuccess(burn.transactionHash, amount, symbol);
            return;
          }
        } catch (err) {
          console.error("[withdraw] fallback poll hatası:", err);
        }
        if (attempts >= MAX_ATTEMPTS && pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }, 5000);
    });
  }, [publicClient, address, vaultToken, vaultAddress, finalizeSuccess]);

  useEffect(() => clearPendingWatchers, [clearPendingWatchers]);

  const handleStatus = useCallback(
    (status: any) => {
      if (PENDING_STATUS_NAMES.has(status?.statusName)) {
        if (!pendingTimerRef.current) {
          settledRef.current = false;
          setErrorMessage(null);
          setSuccessMessage(null);
          setIsProcessing(true);
          pendingTimerRef.current = setTimeout(() => {
            pendingTimerRef.current = null;
            if (!settledRef.current) {
              setErrorMessage(localizedMessage(locale, "timeout"));
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
        setErrorMessage(friendlyError(locale, String(raw)));
        setShowRetry(false);
      }
      if (status?.statusName === "success" && vaultToken) {
        const hash = status?.statusData?.transactionReceipts?.[0]?.transactionHash;
        if (hash) {
          finalizeSuccess(hash, withdrawAmountRef.current, vaultToken.symbol);
        }
      }
    },
    [vaultToken, clearPendingWatchers, startFallbackPoll, finalizeSuccess, locale]
  );

  if (!vaultToken) return null;

  const depositedNum = depositedBalance ? parseFloat(depositedBalance) : 0;
  const maxWithdrawableNum = maxWithdrawable != null ? parseFloat(maxWithdrawable) : null;
  // What the vault can actually pay out right now, capped by both what the
  // user owns and the vault's real available liquidity.
  const cappedMax =
    maxWithdrawableNum != null ? Math.min(depositedNum, maxWithdrawableNum) : depositedNum;
  const liquidityLimited =
    maxWithdrawableNum != null && maxWithdrawableNum < depositedNum - 1e-9;
  // Checked against the user's own position, distinct from exceedsLiquidity
  // below (which is about the vault's available liquidity, not what the
  // user owns) — same "disable + relabel the button" guard as the deposit
  // panel's insufficient-balance check.
  const insufficientPosition = !!withdrawAmount && parseFloat(withdrawAmount) > depositedNum;
  const exceedsLiquidity =
    maxWithdrawableNum != null && !!withdrawAmount && parseFloat(withdrawAmount) > maxWithdrawableNum;
  const withdrawHistory = history.filter((h) => h.type === "withdraw");

  return (
    <div style={{ padding: "1.125rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/usdc.svg" alt="" width={22} height={22} style={{ borderRadius: "50%", flexShrink: 0 }} />
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}>
            {t("withdrawHeader", { symbol: vaultToken.symbol })}
          </span>
        </div>
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#4ade80", fontVariantNumeric: "tabular-nums" }}>
          APY {apy != null ? `${(apy * 100).toFixed(2)}%` : "—"}
        </span>
      </div>
      <WithdrawAmountInput />

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
        borderRadius: "0.875rem", padding: "0.75rem 1rem", marginTop: "0.5rem",
      }}>
        <div>
          <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {cappedMax.toFixed(4)} {vaultToken.symbol}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{t("availableToWithdraw")}</div>
        </div>
        {cappedMax > 0 && (
          <button
            type="button"
            onClick={() => setWithdrawAmount(String(cappedMax))}
            style={{ background: "none", border: "none", color: "#6e9eff", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}
          >
            {t("useMax")}
          </button>
        )}
      </div>

      {liquidityLimited && (
        <p style={{ fontSize: "0.75rem", color: "#fb923c", margin: "0.5rem 0 0", lineHeight: 1.5 }}>
          {t("liquidityLimited", { max: maxWithdrawableNum?.toFixed(4) ?? "0", symbol: vaultToken.symbol })}
        </p>
      )}

      {isProcessing && !successMessage && !errorMessage && (
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", margin: "0.75rem 0 0", lineHeight: 1.5, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ width: "0.875rem", height: "0.875rem", flexShrink: 0, borderRadius: "50%", border: "2px solid rgba(23,184,214,0.25)", borderTopColor: "var(--accent)", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
          {t("processingMessage")}
        </p>
      )}

      {successMessage && (
        <p style={{ fontSize: "0.8125rem", color: "#4ade80", margin: "0.75rem 0 0", lineHeight: 1.5 }}>
          {successMessage}
        </p>
      )}

      {errorMessage && (
        <p style={{ fontSize: "0.8125rem", color: "#f87171", margin: "0.75rem 0 0", lineHeight: 1.5 }}>
          {errorMessage}
        </p>
      )}

      {showRetry && address && (
        <a
          href={`https://basescan.org/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block", textAlign: "center", fontSize: "0.75rem",
            color: "#6e9eff", margin: "0.75rem 0 0", textDecoration: "underline",
          }}
        >
          {t("checkBasescanBeforeRetry")}
        </a>
      )}

      {showRetry && (
        <button
          type="button"
          onClick={resetTransaction}
          style={{
            width: "100%", boxSizing: "border-box", background: "transparent",
            border: "1.5px solid var(--border)", borderRadius: "0.875rem",
            padding: "0.625rem 1rem", fontSize: "0.8125rem", fontWeight: 600,
            color: "var(--text)", margin: "0.5rem 0 0", cursor: "pointer",
          }}
        >
          {t("startNewTransaction")}
        </button>
      )}

      <div style={{ marginTop: "0.75rem" }}>
        <Transaction key={transactionKey} calls={withdrawCalls} onStatus={handleStatus}>
          <TransactionButton
            text={
              withdrawAmountError ??
              (insufficientPosition
                ? t("insufficientBalanceButton")
                : exceedsLiquidity
                ? t("insufficientLiquidity")
                : t("tabWithdraw"))
            }
            disabled={!!withdrawAmountError || !withdrawAmount || insufficientPosition || exceedsLiquidity}
            className="tx-button"
          />
        </Transaction>
      </div>

      {address && withdrawHistory.length > 0 && (
        <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border)", paddingTop: "0.875rem" }}>
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
              background: "transparent", border: "none", cursor: "pointer", padding: 0,
              fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)",
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}
          >
            {t("recentTransactions")}
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"
              style={{ transform: historyOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {historyOpen && (
            <div style={{ marginTop: "0.5rem" }}>
              {withdrawHistory.map((h) => (
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
                  <span>
                    {t("withdrawnLine", { amount: h.amount, symbol: h.symbol })}
                    <br />
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                      {formatHistoryTimestamp(h.timestamp, locale)}
                    </span>
                  </span>
                  <span style={{ color: "#6e9eff", fontSize: "0.75rem", flexShrink: 0 }}>BaseScan ↗</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
