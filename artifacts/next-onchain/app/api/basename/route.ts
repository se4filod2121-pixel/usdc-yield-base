import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  defineChain,
  encodePacked,
  http,
  isAddress,
  keccak256,
  namehash,
  zeroAddress,
  type Address,
} from "viem";
import { rateLimit } from "../../../lib/rateLimit";

// The Basenames Registry is the source of truth for which resolver
// contract currently holds a given node's records. We used to hardcode
// a single resolver address for both lookups below, but the registry
// points the *reverse* node (address -> name) and the *forward* node
// (name -> avatar) at two different resolver contracts for at least
// some accounts (Base has migrated resolvers over time, and reverse
// records don't get moved when a name's forward resolver changes).
// Querying the registry per-node avoids ever hardcoding a resolver
// address again.
const BASENAMES_REGISTRY = "0xB94704422c2a1E396835A571837Aa5AE53285a95" as const;
const BASE_CHAIN_ID = 8453;

const registryAbi = [
  {
    type: "function",
    name: "resolver",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

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

function reverseNode(address: Address): `0x${string}` {
  const addressFormatted = address.toLowerCase() as `0x${string}`;
  const addressNode = keccak256(addressFormatted.substring(2) as `0x${string}`);
  const coinType = ((0x80000000 | BASE_CHAIN_ID) >>> 0).toString(16).toUpperCase();
  const baseReverseNode = namehash(`${coinType}.reverse`);
  return keccak256(encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressNode]));
}

async function resolverFor(node: `0x${string}`): Promise<Address | null> {
  const resolver = await publicClient.readContract({
    address: BASENAMES_REGISTRY,
    abi: registryAbi,
    functionName: "resolver",
    args: [node],
  });
  return resolver === zeroAddress ? null : resolver;
}

// Resolving Basenames client-side (a raw fetch to a public RPC URL) can be
// blocked or silently fail inside some wallets' in-app browsers — the same
// wallet-mediated writes (deposit/withdraw transactions) work fine because
// those go through the wallet's own injected provider, but this is a plain
// read our own app initiates directly. Doing it server-side here sidesteps
// that entirely, the same way /api/deposits and /morpho-api already do for
// their own on-chain/upstream calls.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000, routeName: "basename-get" });
  if (limited) return limited;

  const address = req.nextUrl.searchParams.get("address");

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const rNode = reverseNode(address);
    const reverseResolver = await resolverFor(rNode);
    if (!reverseResolver) {
      return NextResponse.json({ basename: null, avatar: null });
    }

    const basename = await publicClient.readContract({
      address: reverseResolver,
      abi: resolverAbi,
      functionName: "name",
      args: [rNode],
    });

    if (!basename) {
      return NextResponse.json({ basename: null, avatar: null });
    }

    const fNode = namehash(basename);
    const forwardResolver = await resolverFor(fNode);
    let avatar: string | null = null;
    if (forwardResolver) {
      const text = await publicClient.readContract({
        address: forwardResolver,
        abi: resolverAbi,
        functionName: "text",
        args: [fNode, "avatar"],
      });
      avatar = text || null;
    }

    return NextResponse.json({ basename, avatar });
  } catch (err) {
    console.error("[api/basename] resolution error:", err);
    return NextResponse.json({ basename: null, avatar: null });
  }
}
