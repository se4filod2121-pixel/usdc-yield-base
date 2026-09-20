// Compact formatting for large token amounts (e.g. vault TVL/liquidity),
// so a number like "277972385.319182" reads as "277.97M" instead of a wall
// of raw decimal digits.
export function formatCompactNumber(raw: string | number): string {
  const value = typeof raw === "string" ? parseFloat(raw) : raw;
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

// Locale-aware date + time for a transaction history entry. Falls back to
// the browser's default formatting if the locale tag isn't recognized
// (shouldn't happen — every value here comes from our own fixed LOCALES
// list — but a malformed date should never take down the history list).
export function formatHistoryTimestamp(timestamp: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(timestamp)
    );
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}
