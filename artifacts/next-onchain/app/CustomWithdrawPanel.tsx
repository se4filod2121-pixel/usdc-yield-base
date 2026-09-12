"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { erc20Abi } from "viem";
import {
  useEarnContext,
  EarnDetails,
  WithdrawAmountInput,
  WithdrawBalance,
} from "@coinbase/onchainkit/earn";
import { Transaction, TransactionButton } from "@coinbase/onchainkit/transaction";
import {
  friendlyError,
  localizedMessage,
  PENDING_TIMEOUT_MS,
  PENDING_STATUS_NAMES,
} from "../lib/transactionStatus";

export function CustomWithdrawPanel() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const {
    vaultAddress,
    vaultToken,
    withdrawAmount,
    setWithdrawAmount,
    withdrawCalls,
    withdrawAmountError,
    refetchDepositedBalance,
  } = useEarnContext();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [transactionKey, setTransactionKey] = useState(0);
  const [showRetry, setShowRetry] = useState(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settledRef = useRef(false);
  const withdrawAmountRef = useRef(withdrawAmount);
  withdrawAmountRef.current = withdrawAmount;

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
    setTransactionKey((k) => k + 1);
  }, [clearPendingWatchers]);

  // Records a confirmed withdrawal exactly once, whichever of two paths
  // detects it first: OnchainKit's own onStatus("success"), or our
  // independent on-chain poll below (the same OnchainKit <Transaction>
  // callback has, in practice, gone silent on a deposit that had already
  // succeeded on-chain — see CustomDepositPanel — so withdraw gets the same
  // safety net).
  const finalizeSuccess = useCallback(
    (amount: string, symbol: string) => {
      if (settledRef.current) return;
      settledRef.current = true;
      clearPendingWatchers();
      setShowRetry(false);
      setErrorMessage(null);
      setSuccessMessage(`${amount} ${symbol} başarıyla çekildi.`);
      setTransactionKey((k) => k + 1);
      setWithdrawAmount("");
      refetchDepositedBalance();
    },
    [clearPendingWatchers, refetchDepositedBalance, setWithdrawAmount]
  );

  // Fallback for when the wallet has confirmed the withdrawal but
  // OnchainKit's status callback never reports it: watch the vault contract
  // directly for the Transfer that burns this wallet's shares.
  const startFallbackPoll = useCallback(() => {
    if (pollTimerRef.current || !publicClient || !address || !vaultToken || !vaultAddress) return;
    const amount = withdrawAmountRef.current;
    const symbol = vaultToken.symbol;
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
            args: { from: address },
            fromBlock,
            toBlock: "latest",
          });
          if (logs.some((log) => log.transactionHash)) {
            finalizeSuccess(amount, symbol);
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
        const raw = status?.statusData?.message || status?.statusData?.error?.message || "";
        setErrorMessage(friendlyError(String(raw)));
        setShowRetry(false);
      }
      if (status?.statusName === "success" && vaultToken) {
        const hash = status?.statusData?.transactionReceipts?.[0]?.transactionHash;
        if (hash) {
          finalizeSuccess(withdrawAmountRef.current, vaultToken.symbol);
        }
      }
    },
    [vaultToken, clearPendingWatchers, startFallbackPoll, finalizeSuccess]
  );

  if (!vaultToken) return null;

  return (
    <div style={{ padding: "1.125rem" }}>
      <EarnDetails />
      <WithdrawAmountInput />
      <WithdrawBalance />

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

      {showRetry && (
        <button
          type="button"
          onClick={resetTransaction}
          style={{
            width: "100%", boxSizing: "border-box", background: "transparent",
            border: "1.5px solid var(--border)", borderRadius: "0.875rem",
            padding: "0.625rem 1rem", fontSize: "0.8125rem", fontWeight: 600,
            color: "var(--text)", margin: "0.75rem 0 0", cursor: "pointer",
          }}
        >
          Yeni bir işlem başlat
        </button>
      )}

      <div style={{ marginTop: "0.75rem" }}>
        <Transaction key={transactionKey} calls={withdrawCalls} onStatus={handleStatus}>
          <TransactionButton
            text={withdrawAmountError ?? "Withdraw"}
            disabled={!!withdrawAmountError || !withdrawAmount}
            className="tx-button"
          />
        </Transaction>
      </div>
    </div>
  );
}
