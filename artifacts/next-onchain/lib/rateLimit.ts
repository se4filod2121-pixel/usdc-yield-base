import { NextRequest, NextResponse } from "next/server";

// Best-effort, in-memory per-instance rate limiting. Vercel can run multiple
// lambda instances for the same route concurrently, and each cold start
// resets this Map, so this is not a hard distributed limit — a determined
// attacker spread across enough invocations can still exceed it. What it
// does stop is the common case: a single script hammering one of these
// routes from one place, which would otherwise burn our RPC-call budget
// (/api/deposits, /api/basename) or relay budget (/morpho-api) for free. A
// real distributed limit would need shared storage (Upstash/Vercel KV) —
// worth adding if abuse actually shows up in the logs.
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

export function rateLimit(
  req: NextRequest,
  { limit, windowMs, routeName }: { limit: number; windowMs: number; routeName: string }
): NextResponse | null {
  const key = `${routeName}:${clientKey(req)}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  return null;
}
