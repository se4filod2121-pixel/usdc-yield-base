# USDC Yield on Base

A Next.js app on Base mainnet that lets users deposit USDC into Morpho vaults to earn yield, taking a 0.1% platform fee on each deposit.

## Run & Operate

- `pnpm --filter @workspace/next-onchain run dev` — run the deposit app (port 3000)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/next-onchain run test` — unit tests for the fee-calculation logic
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env (see `artifacts/next-onchain/.env.example`): `DATABASE_URL`, `PAYMASTER_RPC_URL`, `NEXT_PUBLIC_ONCHAINKIT_API_KEY`. Optional: `BASE_RPC_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `X402_NETWORK`, `X402_FACILITATOR_URL`, `X402_PAY_TO` (agent API, all default to sane values — see `.env.example`).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Deposit app: Next.js 15 (App Router), React 19, wagmi/viem, OnchainKit (`artifacts/next-onchain`)
- API: Express 5 (`artifacts/api-server`, currently a minimal health-check scaffold)
- DB: PostgreSQL + Drizzle ORM (`lib/db`, shared by all apps)
- Validation: Zod, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle) for the API server, Next.js build for the deposit app

## Where things live

- `artifacts/next-onchain/app/page.tsx` — vault picker + wallet connect UI
- `artifacts/next-onchain/app/CustomDepositPanel.tsx` — deposit flow: builds the batched approve+deposit+fee-transfer calls
- `artifacts/next-onchain/app/api/deposits/route.ts` — records deposits after verifying the reported tx on-chain
- `artifacts/next-onchain/app/api/paymaster/route.ts` — proxies ERC-7677 paymaster JSON-RPC calls (method-allowlisted) to `PAYMASTER_RPC_URL`
- `artifacts/next-onchain/app/morpho-api/route.ts` — proxies Morpho GraphQL vault queries (fixed query, client only supplies variables)
- `lib/db/src/schema/deposits.ts` — source of truth for the `deposits` table; consumed via the `@workspace/db` workspace package
- `artifacts/next-onchain/lib/vaults.ts` — the single vault list, shared by the UI and every server route (agent API, transparency stats) so they can't drift apart
- `artifacts/next-onchain/app/transparency/page.tsx` + `app/api/stats/transparency/route.ts` — public proof-of-yield dashboard (total deposited, fees collected, per-vault and daily-volume breakdowns), linked from the main page's footer
- `artifacts/next-onchain/app/api/agent/vaults/route.ts` + `app/api/agent/deposit-intent/route.ts` — x402-gated (pay-per-call, no API key) machine-readable endpoints for AI agents to find the best-yielding vault and get unsigned deposit calldata; see `app/agent/page.tsx` for the docs page and `lib/x402Server.ts` for the shared resource-server config
- `artifacts/next-onchain/lib/useWalletBalances.ts` + the `IdleBalanceBanner` in `app/page.tsx` — detects USDC/WETH sitting idle in the connected wallet and suggests (never auto-executes) a deposit into the best vault for it

## Architecture decisions

- The 0.1% fee is taken client-side as a second batched ERC-20 transfer alongside the vault deposit call — it is **not enforced on-chain**. A user who bypasses the frontend (calling the vault contract directly) skips the fee. Enforcing it would require a wrapper/router smart contract, which is out of scope today.
- `/api/deposits` is a self-reported ledger for analytics, not a source of truth for balances. It verifies the reported `txHash` against a real Base transaction receipt (sender matches, and a matching-value ERC-20 Transfer to the fee wallet exists in the logs) before writing, to prevent trivially fabricated records.
- `/api/paymaster` only relays the two ERC-7677 methods (`pm_getPaymasterStubData`, `pm_getPaymasterData`) and rejects requests for chains other than Base, so it can't be used as an open relay for arbitrary paymaster RPC calls.
- The agent API (`/api/agent/*`) is priced and gated with x402 (`@x402/next`'s `withX402`), not our own API keys/auth — an AI agent pays a fraction of a cent per call instead of needing an account. It stays strictly non-custodial: both routes only ever return data or unsigned calldata for the agent's *own* wallet to sign, mirroring the "suggest, never move funds" line `RebalanceSuggestion` already drew in the human UI.
- The idle-balance nudge (`IdleBalanceBanner`) is the same non-custodial line: it only ever suggests a vault and lets the user click deposit themselves. **Real automatic sweeping (no click required) is deliberately not built** — it would need an ERC-4337 session-key grant so the app could move funds without a fresh signature each time, which is a meaningfully different trust/security surface than anything else in this app and needs its own review before shipping, not a bolt-on.
- **Card/"spend while earning" integration was scoped out entirely** (design-only, no code) — it needs a real card-issuing partner (e.g. Stripe Issuing, Rain) and a funded settlement relationship, neither of which exists yet. The shape it would take: a webhook from the issuer on each card auth, which pulls the authorized amount out of the user's vault position (a withdraw, same non-custodial pattern — the user pre-authorizes a spending limit once, not per-swipe) before approving the charge.

## Product

- Connect a wallet (Coinbase Smart Wallet, injected, or WalletConnect), pick one of three Morpho USDC vaults on Base (Spark, Seamless, Steakhouse), and deposit or withdraw USDC.
- Deposits are gasless (sponsored via the Coinbase paymaster) and show live APY per vault.
- `/transparency` is a public, unauthenticated dashboard of live numbers pulled straight from the `deposits` table (total deposited, fees collected, per-vault and 30-day daily volume) — no login, nothing curated.
- `/agent` documents the x402-gated agent API for AI agents/programmatic wallets that want to park idle USDC between tasks.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `artifacts/next-onchain/tsconfig.json` targets `ES2020` (not the Next.js default `ES2017`) — the app uses BigInt literals for fee math, which don't type-check below ES2020.
- Next.js build type-checking is **not** suppressed (`typescript.ignoreBuildErrors` was removed) — a real type error will fail `next build`. ESLint is still skipped during builds because no ESLint config/dependency exists in this package.
- `.next` build output is gitignored — never commit it.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
