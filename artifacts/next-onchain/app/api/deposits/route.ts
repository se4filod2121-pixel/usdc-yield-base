import { NextRequest, NextResponse } from "next/server";
import { db, depositsTable, insertDepositSchema } from "@workspace/db";
import { desc, sql } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = insertDepositSchema.safeParse({
      walletAddress: body.walletAddress,
      vaultAddress: body.vaultAddress,
      amount: body.amount,
      feeAmount: body.feeAmount,
      tokenSymbol: body.tokenSymbol,
      txHash: body.txHash,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [inserted] = await db
      .insert(depositsTable)
      .values(parsed.data)
      .onConflictDoNothing({ target: depositsTable.txHash })
      .returning();

    return NextResponse.json({ ok: true, deposit: inserted ?? null });
  } catch (err) {
    console.error("[api/deposits] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");

    if (wallet) {
      const rows = await db
        .select()
        .from(depositsTable)
        .where(sql`${depositsTable.walletAddress} = ${wallet}`)
        .orderBy(desc(depositsTable.createdAt))
        .limit(50);

      return NextResponse.json({ deposits: rows });
    }

    const [summary] = await db
      .select({
        totalDeposited: sql<string>`coalesce(sum(${depositsTable.amount}), 0)`,
        totalFees: sql<string>`coalesce(sum(${depositsTable.feeAmount}), 0)`,
        uniqueUsers: sql<number>`count(distinct ${depositsTable.walletAddress})`,
        totalTx: sql<number>`count(*)`,
      })
      .from(depositsTable);

    const recent = await db
      .select()
      .from(depositsTable)
      .orderBy(desc(depositsTable.createdAt))
      .limit(20);

    return NextResponse.json({ summary, recent });
  } catch (err) {
    console.error("[api/deposits] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
          }
