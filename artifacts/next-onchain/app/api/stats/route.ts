import { NextRequest, NextResponse } from "next/server";
import { db, depositsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { rateLimit } from "../../../lib/rateLimit";

// USD total only sums USDC-denominated deposits (amount ≈ USD 1:1 for a
// stablecoin) — we have no price oracle to convert a WETH deposit's amount
// into USD, and guessing a price would put a fabricated number in a "social
// proof" stat whose entire point is to be trustworthy.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000, routeName: "stats-get" });
  if (limited) return limited;

  try {
    const result = await db.execute<{ depositors: number; total_usdc: string }>(sql`
      SELECT
        count(DISTINCT wallet_address)::int AS depositors,
        coalesce(sum(amount) FILTER (WHERE token_symbol = 'USDC'), 0)::numeric AS total_usdc
      FROM deposits
    `);

    const row = result.rows[0];
    return NextResponse.json({
      depositors: row?.depositors ?? 0,
      totalUsdcDeposited: row ? Number(row.total_usdc) : 0,
    });
  } catch (err) {
    console.error("[api/stats] GET error:", err);
    return NextResponse.json({ depositors: 0, totalUsdcDeposited: 0 });
  }
}
