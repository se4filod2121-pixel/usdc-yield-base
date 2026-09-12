import { NextRequest, NextResponse } from "next/server";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { rateLimit } from "../../../../lib/rateLimit";

// Only counts a referral once the referred wallet has actually made a
// deposit — a bare registration (free, requires no funds) would otherwise
// let anyone farm leaderboard rank with throwaway wallets that never
// deposit anything.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000, routeName: "referral-leaderboard-get" });
  if (limited) return limited;

  try {
    const result = await db.execute<{ referrer_address: string; count: number }>(sql`
      SELECT r.referrer_address, count(DISTINCT r.referred_address)::int AS count
      FROM referrals r
      WHERE EXISTS (
        SELECT 1 FROM deposits d WHERE d.wallet_address = r.referred_address
      )
      GROUP BY r.referrer_address
      ORDER BY count DESC
      LIMIT 10
    `);

    return NextResponse.json({
      leaderboard: result.rows.map((r) => ({ referrerAddress: r.referrer_address, count: r.count })),
    });
  } catch (err) {
    console.error("[api/referral/leaderboard] GET error:", err);
    // Degrade to an empty board rather than failing the page that shows it.
    return NextResponse.json({ leaderboard: [] });
  }
}
