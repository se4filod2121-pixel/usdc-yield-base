import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { encodeFunctionData, erc20Abi, isAddress, parseUnits, formatUnits } from "viem";
import { db, referralsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { findVault } from "../../../../lib/vaults";
import { fetchVaultAssetAddress } from "../../../../lib/morphoServer";
import { computeFee } from "../../../../lib/fee";
import { getX402ResourceServer, X402_PAY_TO, X402_NETWORK } from "../../../../lib/x402Server";
import { rateLimit } from "../../../../lib/rateLimit";

// Standard ERC-4626 `deposit(uint256 assets, address receiver)` — the only
// vault function this route needs. Deliberately not importing the full
// `@coinbase/onchainkit/earn` barrel (client components, React) into a
// server route handler for one function's worth of ABI; every other route
// in this app (see app/api/deposits/route.ts) builds its own minimal viem
// calls for the same reason.
const DEPOSIT_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
] as const;

async function isReferredWallet(walletAddress: `0x${string}`): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: referralsTable.id })
      .from(referralsTable)
      .where(eq(referralsTable.referredAddress, walletAddress))
      .limit(1);
    return !!row;
  } catch (err) {
    console.error("[api/agent/deposit-intent] referral lookup failed, defaulting to no discount:", err);
    return false;
  }
}

// Returns unsigned calldata for an agent's own wallet to sign and broadcast
// itself — this endpoint never touches a private key or moves funds on its
// own. Same non-custodial line the rest of the app draws (see
// RebalanceSuggestion in app/page.tsx): we only ever hand back a
// recommendation/transaction to sign, never execute one.
async function handler(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000, routeName: "agent-deposit-intent" });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { walletAddress, vaultAddress, amount } = (body ?? {}) as Record<string, unknown>;

  if (
    typeof walletAddress !== "string" || !isAddress(walletAddress) ||
    typeof vaultAddress !== "string" || !isAddress(vaultAddress) ||
    typeof amount !== "string" || !/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0
  ) {
    return NextResponse.json({ error: "walletAddress, vaultAddress and amount (decimal string) are required" }, { status: 400 });
  }

  const vault = findVault(vaultAddress);
  if (!vault) {
    return NextResponse.json({ error: "Unknown vault address. See GET /api/agent/vaults for the supported list." }, { status: 400 });
  }

  const assetAddress = await fetchVaultAssetAddress(vault.address);
  if (!assetAddress) {
    return NextResponse.json({ error: "Could not resolve the vault's underlying asset address right now — try again shortly." }, { status: 502 });
  }

  const discounted = await isReferredWallet(walletAddress as `0x${string}`);
  const amountRaw = parseUnits(amount, vault.assetDecimals);
  const feeAmountRaw = computeFee(amountRaw, discounted);
  const netDepositRaw = amountRaw - feeAmountRaw;

  // Same three-call shape CustomDepositPanel.tsx batches for a human
  // deposit: approve the full amount, deposit the post-fee amount (minting
  // shares straight to the caller's own wallet), then pay the platform fee
  // — all against the vault's real underlying-asset contract.
  const calls = [
    {
      to: assetAddress,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault.address, amountRaw] }),
      note: "Approves the vault to pull the full amount from your wallet.",
    },
    {
      to: vault.address,
      data: encodeFunctionData({ abi: DEPOSIT_ABI, functionName: "deposit", args: [netDepositRaw, walletAddress as `0x${string}`] }),
      note: "Deposits the post-fee amount into the vault, minting shares directly to walletAddress.",
    },
    ...(feeAmountRaw > 0n
      ? [{
          to: assetAddress,
          data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [X402_PAY_TO, feeAmountRaw] }),
          note: "Pays the platform fee — batched alongside the deposit exactly like the human deposit flow.",
        }]
      : []),
  ];

  return NextResponse.json({
    vaultAddress: vault.address,
    vaultName: vault.name,
    assetSymbol: vault.assetSymbol,
    assetDecimals: vault.assetDecimals,
    assetAddress,
    amount,
    feeAmount: formatUnits(feeAmountRaw, vault.assetDecimals),
    netDepositAmount: formatUnits(netDepositRaw, vault.assetDecimals),
    referralDiscountApplied: discounted,
    calls,
    note: "Sign and broadcast these calls from walletAddress yourself — this API never holds keys or executes transactions on your behalf. After confirmation, POST the result to /api/deposits (see this app's deposit flow) to record it.",
  });
}

export const POST = withX402(
  handler,
  {
    accepts: {
      scheme: "exact",
      price: "$0.001",
      network: X402_NETWORK,
      payTo: X402_PAY_TO,
    },
    description: "Returns unsigned calldata to deposit USDC/WETH into a Base Morpho vault this app lists, net of the platform fee — for an AI agent's own wallet to sign.",
    mimeType: "application/json",
  },
  getX402ResourceServer(),
  undefined,
  undefined,
  // See app/api/agent/vaults/route.ts — same reasoning for not validating
  // the route/facilitator pairing at module load.
  false,
);
