import { NextRequest, NextResponse } from "next/server";
import { db, depositsTable, insertDepositSchema } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { computeFee } from "../../../lib/fee";
import {
  createPublicClient,
  defineChain,
  http,
  decodeEventLog,
  erc20Abi,
  isAddress,
  isAddressEqual,
  parseUnits,
  TransactionReceiptNotFoundError,
} from "viem";

const FEE_RECIPIENT = "0x39795b0eba8c9fc0c1d05e99daa4a9a799be1d31" as `0x${string}`;

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// Minimal inline chain definition (rather than importing the full
// `viem/chains` barrel) to keep this server route's bundle lean.
const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.BASE_RPC_URL || "https://mainnet.base.org"] } },
});

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

async function getReceiptWithRetry(txHash: `0x${string}`) {
  try {
    return await publicClient.getTransactionReceipt({ hash: txHash });
  } catch (err) {
    if (!(err instanceof TransactionReceiptNotFoundError)) throw err;
    // The client posts right after the wallet confirms; give the RPC node a
    // moment to index the receipt before giving up.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return await publicClient.getTransactionReceipt({ hash: txHash });
  }
}

// Confirms the reported deposit corresponds to a real, successful
// transaction sent by the claimed wallet that actually paid the platform
// fee to FEE_RECIPIENT — so this endpoint can't be used to record
// fabricated deposits with made-up amounts/tx hashes.
async function verifyDepositOnChain(params: {
  txHash: `0x${string}`;
  walletAddress: `0x${string}`;
  tokenAddress: `0x${string}` | null;
  feeAmountRaw: bigint;
}): Promise<boolean> {
  const { txHash, walletAddress, tokenAddress, feeAmountRaw } = params;

  const receipt = await getReceiptWithRetry(txHash);
  if (receipt.status !== "success") return false;
  if (!isAddressEqual(receipt.from, walletAddress)) return false;

  if (feeAmountRaw === 0n) return true;

  return receipt.logs.some((log) => {
    if (tokenAddress && !isAddressEqual(log.address, tokenAddress)) return false;
    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        data: log.data,
        topics: log.topics,
        eventName: "Transfer",
      });
      return isAddressEqual(decoded.args.to, FEE_RECIPIENT) && decoded.args.value === feeAmountRaw;
    } catch {
      return false;
    }
  });
}

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

    const { walletAddress, txHash, feeAmount } = parsed.data;
    const tokenAddress = typeof body.tokenAddress === "string" ? body.tokenAddress : null;
    const decimals = typeof body.decimals === "number" ? body.decimals : null;

    if (
      !TX_HASH_RE.test(txHash) ||
      !isAddress(walletAddress) ||
      (tokenAddress !== null && !isAddress(tokenAddress)) ||
      decimals === null ||
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 36
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const amountRaw = parseUnits(parsed.data.amount, decimals);
    const feeAmountRaw = parseUnits(feeAmount, decimals);

    // The reported fee must match what our own fee schedule would produce for
    // the reported amount, so a real (verified) transaction can't be paired
    // with an inflated `amount` to skew the deposit stats.
    if (feeAmountRaw !== computeFee(amountRaw)) {
      return NextResponse.json({ error: "Fee amount does not match the deposit amount" }, { status: 400 });
    }

    let verified: boolean;
    try {
      verified = await verifyDepositOnChain({
        txHash: txHash as `0x${string}`,
        walletAddress: walletAddress as `0x${string}`,
        tokenAddress: tokenAddress as `0x${string}` | null,
        feeAmountRaw,
      });
    } catch (err) {
      console.error("[api/deposits] on-chain verification error:", err);
      return NextResponse.json({ error: "Could not verify transaction" }, { status: 502 });
    }

    if (!verified) {
      return NextResponse.json({ error: "Deposit could not be verified on-chain" }, { status: 400 });
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
