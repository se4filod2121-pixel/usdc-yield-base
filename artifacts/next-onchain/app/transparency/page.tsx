"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../../lib/LocaleContext";
import { VAULTS } from "../../lib/vaults";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "1.25rem",
  width: "100%",
  overflow: "hidden",
};

type TransparencyStats = {
  depositors: number;
  depositCount: number;
  totalUsdcDeposited: number;
  totalFeesUsdc: number;
  perVault: { vaultAddress: string; depositCount: number; totalUsdc: number }[];
  dailyVolumeUsdc: { day: string; totalUsdc: number }[];
};

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...card, padding: "1rem 1.125rem" }}>
      <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.03em", margin: "0 0 0.375rem" }}>
        {label}
      </p>
      <p style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </p>
    </div>
  );
}

function DailyVolumeChart({ data }: { data: { day: string; totalUsdc: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.totalUsdc));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "5rem" }}>
      {data.map((d) => (
        <div
          key={d.day}
          title={`${d.day}: ${formatUsd(d.totalUsdc)}`}
          style={{
            flex: 1,
            height: `${Math.max(2, (d.totalUsdc / max) * 100)}%`,
            background: d.totalUsdc > 0 ? "var(--accent)" : "rgba(255,255,255,0.08)",
            borderRadius: "2px 2px 0 0",
          }}
        />
      ))}
    </div>
  );
}

export default function TransparencyPage() {
  const { t } = useLocale();
  const [stats, setStats] = useState<TransparencyStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/transparency")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStats({ depositors: 0, depositCount: 0, totalUsdcDeposited: 0, totalFeesUsdc: 0, perVault: [], dailyVolumeUsdc: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "flex-start",
      gap: "1rem", padding: "2.25rem 1rem 4rem",
      background: "var(--bg)", width: "100%", maxWidth: "30rem", marginInline: "auto", boxSizing: "border-box",
    }}>
      <div style={{ width: "100%" }}>
        <a href="/" style={{ fontSize: "0.8125rem", color: "var(--muted)", textDecoration: "none" }}>
          {t("transparencyBack")}
        </a>
      </div>

      <div style={{ textAlign: "center", width: "100%" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.375rem" }}>
          {t("transparencyPageTitle")}
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
          {t("transparencyPageSubtitle")}
        </p>
      </div>

      {!stats ? (
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>{t("transparencyLoading")}</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", width: "100%" }}>
            <StatCard label={t("transparencyTotalDeposited")} value={formatUsd(stats.totalUsdcDeposited)} />
            <StatCard label={t("transparencyTotalFees")} value={formatUsd(stats.totalFeesUsdc)} />
            <StatCard label={t("transparencyDepositors")} value={stats.depositors.toLocaleString()} />
            <StatCard label={t("transparencyDepositCount")} value={stats.depositCount.toLocaleString()} />
          </div>

          <div style={{ ...card, padding: "1.125rem", width: "100%", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <h2 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.02em", margin: 0 }}>
              {t("transparencyDailyVolumeHeading")}
            </h2>
            <DailyVolumeChart data={stats.dailyVolumeUsdc} />
          </div>

          <div style={{ ...card, padding: "1.125rem", width: "100%", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            <h2 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.02em", margin: 0 }}>
              {t("transparencyPerVaultHeading")}
            </h2>
            {stats.perVault.length === 0 ? (
              <p style={{ fontSize: "0.8125rem", color: "var(--muted)", margin: 0 }}>{t("transparencyEmpty")}</p>
            ) : (
              stats.perVault.map((v) => {
                const meta = VAULTS.find((vault) => vault.address.toLowerCase() === v.vaultAddress.toLowerCase());
                return (
                  <div key={v.vaultAddress} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8125rem" }}>
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>{meta?.name ?? `${v.vaultAddress.slice(0, 6)}...${v.vaultAddress.slice(-4)}`}</span>
                    <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{formatUsd(v.totalUsdc)} · {v.depositCount}</span>
                  </div>
                );
              })
            )}
          </div>

          <a
            href={`https://basescan.org/address/0x39795b0eba8c9fc0c1d05e99daa4a9a799be1d31`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "0.72rem", color: "var(--muted)", textDecoration: "underline", textUnderlineOffset: "0.15rem" }}
          >
            View fee wallet on Basescan ↗
          </a>
        </>
      )}
    </main>
  );
}
