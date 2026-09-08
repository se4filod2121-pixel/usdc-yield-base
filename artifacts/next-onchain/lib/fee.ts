export const FEE_BPS = 10n;
export const FEE_DENOMINATOR = 10000n;

export function computeFee(amountRaw: bigint): bigint {
  return (amountRaw * FEE_BPS) / FEE_DENOMINATOR;
}
