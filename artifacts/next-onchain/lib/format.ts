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
