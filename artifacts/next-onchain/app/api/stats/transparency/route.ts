import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { rateLimit } from "../../../../lib/rateLimit";

// Public proof-of-yield dashboard data. Like /api/stats, USD totals only
// ever sum USDC-denominated deposits — there's no price oracle here to
// convert a WETH deposit's amount into USD, and a fabricated number would
// undercut the entire point of a page whose job is to be trustworthy.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000, routeName: "stats-transparency-get" });
  if (limited) return limited;

  try {
    const [totalsResult, perVaultResult, dailyResult] = await Promise.all([
      db.execute<{ depositors: number; deposit_count: number; total_usdc: string; total_fees_usdc: string }>(sql`
        SELECT
          count(DISTINCT wallet_address)::int AS depositors,
          count(*)::int AS deposit_count,
          coalesce(sum(amount) FILTER (WHERE token_symbol = 'USDC'), 0)::numeric AS total_usdc,
          coalesce(sum(fee_amount) FILTER (WHERE token_symbol = 'USDC'), 0)::numeric AS total_fees_usdc
        FROM deposits
      `),
      db.execute<{ vault_address: string; deposit_count: number; total_usdc: string }>(sql`
        SELECT
          vault_address,
          count(*)::int AS deposit_count,
          coalesce(sum(amount) FILTER (WHERE token_symbol = 'USDC'), 0)::numeric AS total_usdc
        FROM deposits
        GROUP BY vault_address
      `),
      db.execute<{ day: string; total_usdc: string }>(sql`
        WITH days AS (
          SELECT generate_series(
            date_trunc('day', now() - interval '29 days'),
            date_trunc('day', now()),
            interval '1 day'
          )::date AS day
        )
        SELECT
          days.day::text AS day,
          coalesce(sum(d.amount) FILTER (WHERE d.token_symbol = 'USDC'), 0)::numeric AS total_usdc
        FROM days
        LEFT JOIN deposits d ON date_trunc('day', d.created_at)::date = days.day
        GROUP BY days.day
        ORDER BY days.day
      `),
    ]);

    const totals = totalsResult.rows[0];

    return NextResponse.json({
      depositors: totals?.depositors ?? 0,
      depositCount: totals?.deposit_count ?? 0,
      totalUsdcDeposited: totals ? Number(totals.total_usdc) : 0,
      totalFeesUsdc: totals ? Number(totals.total_fees_usdc) : 0,
      perVault: perVaultResult.rows.map((r) => ({
        vaultAddress: r.vault_address,
        depositCount: r.deposit_count,
        totalUsdc: Number(r.total_usdc),
      })),
      dailyVolumeUsdc: dailyResult.rows.map((r) => ({
        day: r.day,
        totalUsdc: Number(r.total_usdc),
      })),
    });
  } catch (err) {
    console.error("[api/stats/transparency] GET error:", err);
    return NextResponse.json(
      { depositors: 0, depositCount: 0, totalUsdcDeposited: 0, totalFeesUsdc: 0, perVault: [], dailyVolumeUsdc: [] },
      { status: 200 }
    );
  }
}
