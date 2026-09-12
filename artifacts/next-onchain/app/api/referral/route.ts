import { NextRequest, NextResponse } from "next/server";
import { db, referralsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { isAddress, isAddressEqual } from "viem";
import { rateLimit } from "../../../lib/rateLimit";

// Registers a referral relationship the first time a referred wallet is
// seen. Enforced idempotent by the DB's own unique constraint on
// referredAddress (see lib/db/src/schema/referrals.ts) — a wallet keeps
// whichever referrer it first used, and a race between concurrent requests
// can't assign it to two different referrers.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 20, windowMs: 60_000, routeName: "referral-post" });
  if (limited) return limited;

  try {
    const body = await req.json();
    const referrer = typeof body?.referrer === "string" ? body.referrer : null;
    const referred = typeof body?.referred === "string" ? body.referred : null;

    if (!referrer || !referred || !isAddress(referrer) || !isAddress(referred)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    if (isAddressEqual(referrer as `0x${string}`, referred as `0x${string}`)) {
      return NextResponse.json({ error: "Cannot refer yourself" }, { status: 400 });
    }

    const [inserted] = await db
      .insert(referralsTable)
      .values({ referrerAddress: referrer, referredAddress: referred })
      .onConflictDoNothing({ target: referralsTable.referredAddress })
      .returning();

    return NextResponse.json({ ok: true, applied: !!inserted });
  } catch (err) {
    console.error("[api/referral] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000, routeName: "referral-get" });
  if (limited) return limited;

  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet || !isAddress(wallet)) {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }

    const [referredRow] = await db
      .select({ referrerAddress: referralsTable.referrerAddress })
      .from(referralsTable)
      .where(eq(referralsTable.referredAddress, wallet))
      .limit(1);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(referralsTable)
      .where(eq(referralsTable.referrerAddress, wallet));

    return NextResponse.json({
      referredBy: referredRow?.referrerAddress ?? null,
      referralCount: Number(countRow?.count ?? 0),
    });
  } catch (err) {
    console.error("[api/referral] GET error:", err);
    // Degrade to "no referral relationship" rather than failing the caller —
    // referrals are a bonus discount, never something that should block or
    // break the rest of the app if this table isn't reachable.
    return NextResponse.json({ referredBy: null, referralCount: 0 });
  }
}
