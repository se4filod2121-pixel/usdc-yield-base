import { NextRequest, NextResponse } from "next/server";
import { db, depositsTable, referralsTable, insertDepositSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { computeFee } from "../../../lib/fee";
import { rateLimit } from "../../../lib/rateLimit";
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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

// Looked up independently server-side (never trusted from the client) so a
// discount can't be claimed by a wallet that wasn't actually referred. Falls
// back to "not referred" on any failure, including the referrals table not
// existing yet in an environment that hasn't run the latest schema push —
// a referral-lookup problem must never block or fail a real deposit.
async function isReferredWallet(walletAddress: `0x${string}`): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: referralsTable.id })
      .from(referralsTable)
      .where(eq(referralsTable.referredAddress, walletAddress))
      .limit(1);
    return !!row;
  } catch (err) {
    console.error("[api/deposits] referral lookup failed, defaulting to no discount:", err);
    return false;
  }
}

// Confirms the reported deposit corresponds to a real, successful
// transaction that actually paid the platform fee (from the claimed
// wallet, to FEE_RECIPIENT) — so this endpoint can't be used to record
// fabricated deposits with made-up amounts/tx hashes.
//
// Note: `receipt.from` is NOT checked against `walletAddress` — for a
// Coinbase Smart Wallet (or any ERC-4337-style account), the outer
// transaction is submitted by a bundler, so `receipt.from` is the
// bundler's address, never the user's. The wallet linkage instead comes
// from the decoded Transfer log itself (its own `from`/`to` fields).
async function verifyDepositOnChain(params: {
  txHash: `0x${string}`;
  walletAddress: `0x${string}`;
  tokenAddress: `0x${string}` | null;
  vaultAddress: `0x${string}` | null;
  feeAmountRaw: bigint;
}): Promise<boolean> {
  const { txHash, walletAddress, tokenAddress, vaultAddress, feeAmountRaw } = params;

  const receipt = await getReceiptWithRetry(txHash);
  if (receipt.status !== "success") return false;

  const decodedTransfers = receipt.logs.flatMap((log) => {
    try {
      return [{ address: log.address, ...decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, eventName: "Transfer" }) }];
    } catch {
      return [];
    }
  });

  if (feeAmountRaw > 0n) {
    const paidFee = decodedTransfers.some(
      (t) =>
        (!tokenAddress || isAddressEqual(t.address, tokenAddress)) &&
        isAddressEqual(t.args.from, walletAddress) &&
        isAddressEqual(t.args.to, FEE_RECIPIENT) &&
        t.args.value === feeAmountRaw
    );
    if (paidFee) return true;
  }

  // No fee paid (or the fee-transfer log wasn't found): fall back to
  // confirming the vault actually minted shares to this wallet in the
  // same transaction.
  if (!vaultAddress) return false;
  return decodedTransfers.some(
    (t) =>
      isAddressEqual(t.address, vaultAddress) &&
      isAddressEqual(t.args.from, ZERO_ADDRESS) &&
      isAddressEqual(t.args.to, walletAddress)
  );
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 10, windowMs: 60_000, routeName: "deposits-post" });
  if (limited) return limited;

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
    // with an inflated `amount` to skew the deposit stats. A referred wallet
    // is allowed the discounted rate instead of the standard one.
    const discounted = await isReferredWallet(walletAddress as `0x${string}`);
    if (feeAmountRaw !== computeFee(amountRaw, discounted)) {
      return NextResponse.json({ error: "Fee amount does not match the deposit amount" }, { status: 400 });
    }

    let verified: boolean;
    try {
      verified = await verifyDepositOnChain({
        txHash: txHash as `0x${string}`,
        walletAddress: walletAddress as `0x${string}`,
        tokenAddress: tokenAddress as `0x${string}` | null,
        vaultAddress: parsed.data.vaultAddress as `0x${string}` | null,
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
