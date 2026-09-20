// Single source of truth for the vault list — shared by the UI (app/page.tsx)
// and by server-side routes (transparency stats, the agent API) so they can
// never drift into showing two different sets of vaults.
const USDC_LOGO = "/usdc.svg";

export const VAULTS = [
  { address: "0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A" as `0x${string}`, name: "Spark USDC", tag: "Spark", curatorUrl: "https://spark.fi", assetSymbol: "USDC", assetDecimals: 6, logo: USDC_LOGO },
  { address: "0x616a4E1db48e22028f6bbf20444Cd3b8e3273738" as `0x${string}`, name: "Seamless USDC", tag: "Seamless", curatorUrl: "https://seamlessprotocol.com", assetSymbol: "USDC", assetDecimals: 6, logo: USDC_LOGO },
  { address: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183" as `0x${string}`, name: "Steakhouse USDC", tag: "Steakhouse", curatorUrl: "https://www.steakhouse.financial", assetSymbol: "USDC", assetDecimals: 6, logo: USDC_LOGO },
  // First non-USDC vault: verified on-chain (asset() returns Base's canonical
  // WETH address, real bytecode, non-trivial totalAssets) before being added
  // here — see the session notes on why that verification matters before
  // trusting a contract address with real deposits.
  { address: "0x27D8c7273fd3fcC6956a0B370cE5Fd4A7fc65c18" as `0x${string}`, name: "Seamless WETH Vault", tag: "Seamless", curatorUrl: "https://seamlessprotocol.com", assetSymbol: "WETH", assetDecimals: 18, logo: undefined },
] as const;

export type VaultAddress = (typeof VAULTS)[number]["address"];
export type VaultSpec = (typeof VAULTS)[number];

export const VAULT_ADDRESSES = VAULTS.map((v) => v.address) as VaultAddress[];

export function findVault(address: string): VaultSpec | undefined {
  return VAULTS.find((v) => v.address.toLowerCase() === address.toLowerCase());
}
