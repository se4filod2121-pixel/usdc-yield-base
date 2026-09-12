"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { erc20Abi, parseUnits, encodeFunctionData, formatUnits } from "viem";
import {
  useEarnContext,
  buildDepositToMorphoTx,
} from "@coinbase/onchainkit/earn";
import { Transaction, TransactionButton } from "@coinbase/onchainkit/transaction";
import { computeFee } from "../lib/fee";

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

/* ─── multi-language error messages ─── */
const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  insufficient: {
    tr: "Yetersiz bakiye. Lütfen daha düşük bir miktar girin.",
    en: "Insufficient balance. Please enter a smaller amount.",
    es: "Saldo insuficiente. Por favor ingrese un monto menor.",
    de: "Unzureichendes Guthaben. Bitte geben Sie einen kleineren Betrag ein.",
    fr: "Solde insuffisant. Veuillez saisir un montant plus faible.",
    pt: "Saldo insuficiente. Insira um valor menor.",
  },
  rejected: {
    tr: "İşlem cüzdanınızda onaylanmadı.",
    en: "Transaction was not approved in your wallet.",
    es: "La transacción no fue aprobada en tu billetera.",
    de: "Die Transaktion wurde in Ihrer Wallet nicht genehmigt.",
    fr: "La transaction n'a pas été approuvée dans votre portefeuille.",
    pt: "A transação não foi aprovada na sua carteira.",
  },
  network: {
    tr: "Ağ hatası. Cüzdanınızın Base ağında olduğundan emin olun.",
    en: "Network error. Make sure your wallet is on the Base network.",
    es: "Error de red. Asegúrate de que tu billetera esté en la red Base.",
    de: "Netzwerkfehler. Stellen Sie sicher, dass Ihre Wallet im Base-Netzwerk ist.",
    fr: "Erreur réseau. Assurez-vous que votre portefeuille est sur le réseau Base.",
    pt: "Erro de rede. Verifique se sua carteira está na rede Base.",
  },
  reverted: {
    tr: "İşlem zincir tarafından reddedildi. Lütfen miktarı kontrol edip tekrar deneyin.",
    en: "Transaction was rejected on-chain. Please check the amount and try again.",
    es: "La transacción fue rechazada en la cadena. Verifica el monto e intenta de nuevo.",
    de: "Transaktion wurde on-chain abgelehnt. Bitte überprüfen Sie den Betrag und versuchen Sie es erneut.",
    fr: "La transaction a été rejetée sur la chaîne. Vérifiez le montant et réessayez.",
    pt: "A transação foi rejeitada na blockchain. Verifique o valor e tente novamente.",
  },
  generic: {
    tr: "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    en: "Something went wrong. Please try again.",
    es: "Algo salió mal. Por favor intenta de nuevo.",
    de: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    fr: "Une erreur s'est produite. Veuillez réessayer.",
    pt: "Algo deu errado. Tente novamente.",
  },
  timeout: {
    tr: "İşlem cüzdanınızdan çok uzun sürdü. Cüzdan uygulamanızı kontrol edin ve tekrar deneyin.",
    en: "This is taking longer than expected. Check your wallet app and try again.",
    es: "Esto está tardando más de lo esperado. Revisa tu billetera e intenta de nuevo.",
    de: "Dies dauert länger als erwartet. Überprüfen Sie Ihre Wallet-App und versuchen Sie es erneut.",
    fr: "Cela prend plus de temps que prévu. Vérifiez votre portefeuille et réessayez.",
    pt: "Isso está demorando mais do que o esperado. Verifique seu aplicativo de carteira e tente novamente.",
  },
};

function getUserLocale(): string {
  if (typeof navigator === "undefined") return "en";
  const lang = navigator.language?.split("-")[0]?.toLowerCase() || "en";
  return ["tr", "en", "es", "de", "fr", "pt"].includes(lang) ? lang : "en";
}

function localizedMessage(key: keyof typeof ERROR_MESSAGES): string {
  const locale = getUserLocale();
  return ERROR_MESSAGES[key][locale] || ERROR_MESSAGES[key]["en"];
}

function friendlyError(raw: string): string {
  const msg = raw.toLowerCase();
  let key: keyof typeof ERROR_MESSAGES = "generic";
  if (msg.includes("insufficient") || msg.includes("exceeds balance")) key = "insufficient";
  else if (msg.includes("user rejected") || msg.includes("denied")) key = "rejected";
  else if (msg.includes("network") || msg.includes("chain")) key = "network";
  else if (msg.includes("execution reverted")) key = "reverted";
  return localizedMessage(key);
}

// The OnchainKit <Transaction> component has no built-in timeout, so on a
// slow wallet round-trip its button just spins forever with no feedback.
// After this long we tell the user it's taking a while — but we do NOT
// remount the component: a real confirmation can still arrive well past
// this mark (mobile wallet hand-offs are slow), and remounting would tear
// down the listener and silently drop that success. Remounting only
// happens if the user explicitly asks to retry.
const PENDING_TIMEOUT_MS = 40_000;
const PENDING_STATUS_NAMES = new Set([
  "buildingTransaction",
  "transactionPending",
  "transactionLegacyExecuted",
]);

export function CustomDepositPanel({ vaultAddress }: { vaultAddress: `0x${string}` }) {
  const { address } = useAccount();
  const { vaultToken, apy, deposits, liquidity, walletBalance } = useEarnContext();
  const [amount, setAmount] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [transactionKey, setTransactionKey] = useState(0);
  const [showRetry, setShowRetry] = useState(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTransaction = useCallback(() => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setShowRetry(false);
    setErrorMessage(null);
    setTransactionKey((k) => k + 1);
  }, []);

  useEffect(() => {
    setHistory(loadHistory());
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, []);

  const buildCalls = useCallback(async () => {
    setErrorMessage(null);
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
  }, [address, amount, vaultToken, vaultAddress, walletBalance]);

  const handleStatus = useCallback((status: any) => {
    if (PENDING_STATUS_NAMES.has(status?.statusName)) {
      if (!pendingTimerRef.current) {
        pendingTimerRef.current = setTimeout(() => {
          pendingTimerRef.current = null;
          setErrorMessage(localizedMessage("timeout"));
          setShowRetry(true);
        }, PENDING_TIMEOUT_MS);
      }
    } else if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }

    if (status?.statusName === "error") {
      const raw = status?.statusData?.message || status?.statusData?.error?.message || "";
      setErrorMessage(friendlyError(String(raw)));
      setShowRetry(false);
    }
    if (status?.statusName === "success") {
      setShowRetry(false);
      const hash = status?.statusData?.transactionReceipts?.[0]?.transactionHash;
      if (hash && vaultToken && address) {
        const entry: HistoryEntry = {
          hash,
          amount,
          symbol: vaultToken.symbol,
          timestamp: Date.now(),
        };
        saveHistoryEntry(entry);
        setHistory(loadHistory());

        const parsedAmount = parseUnits(amount, vaultToken.decimals);
        const feeAmount = computeFee(parsedAmount);

        fetch("/api/deposits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: address,
            vaultAddress,
            amount,
            feeAmount: formatUnits(feeAmount, vaultToken.decimals),
            tokenSymbol: vaultToken.symbol,
            tokenAddress: vaultToken.address,
            decimals: vaultToken.decimals,
            txHash: hash,
          }),
        }).catch((err) => console.error("[deposits] backend kayıt hatası:", err));
      }
      setErrorMessage(null);
      setAmount("");
    }
  }, [amount, vaultToken, address]);

  if (!vaultToken) return null;

  const feeAmountPreview =
    amount && parseFloat(amount) > 0
      ? formatUnits(computeFee(parseUnits(amount, vaultToken.decimals)), vaultToken.decimals)
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
        onChange={(e) => { setAmount(e.target.value); setErrorMessage(null); setShowRetry(false); }}
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
        <TransactionButton text="Deposit" />
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
