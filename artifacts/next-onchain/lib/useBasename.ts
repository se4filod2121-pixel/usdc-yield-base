"use client";

import { encodePacked, keccak256, namehash, type Address } from "viem";
import { useReadContract } from "wagmi";

// The @coinbase/onchainkit version pinned in this app (0.38.6) hardcodes
// Basenames' OLD resolver contract (0xC6d566A56A1aFf6508b41f6c90ff131615583BCD),
// which Base has since migrated away from — verified on-chain: querying it
// for a real, correctly-configured Basename returns nothing, while the
// current resolver below returns the right name and avatar. Query it
// directly instead of relying on OnchainKit's <Name>/<Avatar>, which
// silently return null because of this.
const BASENAME_RESOLVER = "0x426fA03fb86e510D0dD9f70335cF102a98B10875" as const;

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

const BASE_CHAIN_ID = 8453;

// Reverse ENSIP-11 node for an address on a given chain — same derivation
// OnchainKit's own (correct) hashing logic uses, just pointed at the
// resolver that's actually current.
function reverseNode(address: Address): `0x${string}` {
  const addressFormatted = address.toLowerCase() as Address;
  const addressNode = keccak256(addressFormatted.substring(2) as `0x${string}`);
  const coinType = ((0x80000000 | BASE_CHAIN_ID) >>> 0).toString(16).toUpperCase();
  const baseReverseNode = namehash(`${coinType}.reverse`);
  return keccak256(encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressNode]));
}

export function useBasename(address?: Address) {
  const { data: basename, isLoading: isLoadingName } = useReadContract({
    address: BASENAME_RESOLVER,
    abi: resolverAbi,
    functionName: "name",
    args: address ? [reverseNode(address)] : undefined,
    query: { enabled: !!address },
  });

  const forwardNode = basename ? namehash(basename) : undefined;

  const { data: avatar, isLoading: isLoadingAvatar } = useReadContract({
    address: BASENAME_RESOLVER,
    abi: resolverAbi,
    functionName: "text",
    args: forwardNode ? [forwardNode, "avatar"] : undefined,
    query: { enabled: !!forwardNode },
  });

  return {
    basename: basename || null,
    avatar: avatar || null,
    isLoading: isLoadingName || (!!basename && isLoadingAvatar),
  };
}
