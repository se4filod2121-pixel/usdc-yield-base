export const FEE_BPS = 10n;
export const FEE_DENOMINATOR = 10000n;

// A wallet that was referred by someone else pays half the platform fee on
// its deposits. The referrer gets nothing paid out automatically (no payout
// mechanism exists yet) — this is purely a discount for the referred user,
// with the referrer's count shown in the UI as a lightweight incentive.
export const REFERRAL_FEE_BPS = FEE_BPS / 2n;

export function computeFee(amountRaw: bigint, discounted = false): bigint {
  const bps = discounted ? REFERRAL_FEE_BPS : FEE_BPS;
  return (amountRaw * bps) / FEE_DENOMINATOR;
}
