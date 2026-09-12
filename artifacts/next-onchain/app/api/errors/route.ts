import { NextRequest, NextResponse } from "next/server";
import { db, errorLogsTable } from "@workspace/db";
import { isAddress } from "viem";
import { rateLimit } from "../../../lib/rateLimit";

const MAX_MESSAGE_LEN = 2000;
const MAX_STACK_LEN = 8000;
const MAX_URL_LEN = 500;

// Best-effort client error reporting: always answers 200/ok, even when the
// insert itself fails (e.g. the table doesn't exist yet in an environment
// that hasn't run the latest schema push) — a broken logging pipe must never
// itself become a second error the client has to handle.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 20, windowMs: 60_000, routeName: "errors-post" });
  if (limited) return limited;

  try {
    const body = await req.json();
    const message = typeof body?.message === "string" ? body.message.slice(0, MAX_MESSAGE_LEN) : null;
    if (!message) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const stack = typeof body?.stack === "string" ? body.stack.slice(0, MAX_STACK_LEN) : null;
    const url = typeof body?.url === "string" ? body.url.slice(0, MAX_URL_LEN) : null;
    const walletAddress = typeof body?.walletAddress === "string" && isAddress(body.walletAddress) ? body.walletAddress : null;

    await db.insert(errorLogsTable).values({ message, stack, url, walletAddress });
  } catch (err) {
    console.error("[api/errors] could not persist client error report:", err);
  }

  return NextResponse.json({ ok: true });
}
