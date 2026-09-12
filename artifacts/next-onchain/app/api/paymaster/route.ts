import type { NextRequest } from "next/server";
import { rateLimit } from "../../../lib/rateLimit";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ERC-7677 methods this app's paymaster proxy is meant to relay. Anything
// else (or a request for a chain other than Base) is rejected so this
// endpoint can't be used as an open relay to spend the paymaster's budget
// on arbitrary JSON-RPC calls.
const ALLOWED_METHODS = new Set(["pm_getPaymasterStubData", "pm_getPaymasterData"]);
const BASE_CHAIN_ID_HEX = "0x2105"; // 8453
const MAX_BODY_BYTES = 64 * 1024;
// If PAYMASTER_RPC_URL itself hangs, an unbounded fetch here would leave the
// caller's wallet_sendCalls request (and its "Deposit" button) spinning
// forever with nothing to show for it. Fail fast with a real JSON-RPC error
// instead.
const UPSTREAM_TIMEOUT_MS = 15_000;

// The wallet calling this endpoint (not our own frontend) is the one that
// interprets the response, so it must always be a well-formed JSON-RPC 2.0
// reply — a bare `{ error: "..." }` body is not something a spec-compliant
// client necessarily knows how to surface as a failure.
function rpcError(id: unknown, code: number, message: string) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000, routeName: "paymaster-post" });
  if (limited) return limited;

  const url = process.env.PAYMASTER_RPC_URL;

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return rpcError(null, -32600, "Payload too large");
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return rpcError(null, -32700, "Invalid JSON");
  }

  const id = typeof body === "object" && body !== null ? (body as { id?: unknown }).id : null;

  if (!url) {
    return rpcError(id, -32603, "Paymaster not configured");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { method?: unknown }).method !== "string" ||
    !ALLOWED_METHODS.has((body as { method: string }).method)
  ) {
    return rpcError(id, -32601, "Unsupported method");
  }

  const params = (body as { params?: unknown }).params;
  const chainIdHex = Array.isArray(params) ? params[2] : undefined;
  if (typeof chainIdHex === "string" && chainIdHex.toLowerCase() !== BASE_CHAIN_ID_HEX) {
    return rpcError(id, -32602, "Unsupported chain");
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const data = await res.json();

    if (data && typeof data === "object" && "error" in data) {
      console.error("[api/paymaster] upstream rejected:", JSON.stringify((data as { error: unknown }).error));
    }

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[api/paymaster] upstream error:", err);
    return rpcError(id, -32603, "Paymaster upstream unavailable");
  }
}
