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

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const url = process.env.PAYMASTER_RPC_URL;
  if (!url) {
    return jsonError(500, "Paymaster not configured");
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonError(413, "Payload too large");
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { method?: unknown }).method !== "string" ||
    !ALLOWED_METHODS.has((body as { method: string }).method)
  ) {
    return jsonError(400, "Unsupported method");
  }

  const params = (body as { params?: unknown }).params;
  const chainIdHex = Array.isArray(params) ? params[2] : undefined;
  if (typeof chainIdHex === "string" && chainIdHex.toLowerCase() !== BASE_CHAIN_ID_HEX) {
    return jsonError(400, "Unsupported chain");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });

  const data = await res.json();

  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
