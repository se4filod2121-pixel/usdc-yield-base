import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  defineChain,
  encodePacked,
  http,
  isAddress,
  keccak256,
  namehash,
} from "viem";

// See lib/useBasename.ts for why this is queried directly instead of
// relying on the version of @coinbase/onchainkit pinned in this app (it
// hardcodes an old, since-migrated-away-from resolver address).
const BASENAME_RESOLVER = "0x426fA03fB86E510d0Dd9F70335Cf102a98b10875" as const;
const BASE_CHAIN_ID = 8453;

const resolverAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

// Minimal inline chain definition (rather than importing the full
// `viem/chains` barrel) to keep this server route's bundle lean.
const base = defineChain({
  id: BASE_CHAIN_ID,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.BASE_RPC_URL || "https://mainnet.base.org"] } },
});

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

function reverseNode(address: `0x${string}`): `0x${string}` {
  const addressFormatted = address.toLowerCase() as `0x${string}`;
  const addressNode = keccak256(addressFormatted.substring(2) as `0x${string}`);
  const coinType = ((0x80000000 | BASE_CHAIN_ID) >>> 0).toString(16).toUpperCase();
  const baseReverseNode = namehash(`${coinType}.reverse`);
  return keccak256(encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressNode]));
}

// Resolving Basenames client-side (a raw fetch to a public RPC URL) can be
// blocked or silently fail inside some wallets' in-app browsers — the same
// wallet-mediated writes (deposit/withdraw transactions) work fine because
// those go through the wallet's own injected provider, but this is a plain
// read our own app initiates directly. Doing it server-side here sidesteps
// that entirely, the same way /api/deposits and /morpho-api already do for
// their own on-chain/upstream calls.
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const basename = await publicClient.readContract({
      address: BASENAME_RESOLVER,
      abi: resolverAbi,
      functionName: "name",
      args: [reverseNode(address)],
    });

    if (!basename) {
      return NextResponse.json({ basename: null, avatar: null });
    }

    const avatar = await publicClient.readContract({
      address: BASENAME_RESOLVER,
      abi: resolverAbi,
      functionName: "text",
      args: [namehash(basename), "avatar"],
    });

    return NextResponse.json({ basename, avatar: avatar || null });
  } catch (err) {
    console.error("[api/basename] resolution error:", err);
    return NextResponse.json({ basename: null, avatar: null });
  }
}
