import { NextRequest, NextResponse } from "next/server";
import { db, notificationSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { rateLimit } from "../../../../lib/rateLimit";

// A plain GET so the link in an email works with a single click, no login —
// the unguessable token in the link itself is the authorization.
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000, routeName: "notifications-unsubscribe" });
  if (limited) return limited;

  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    await db
      .delete(notificationSubscriptionsTable)
      .where(eq(notificationSubscriptionsTable.unsubscribeToken, token));

    return new NextResponse(
      "<!doctype html><meta charset=utf-8><title>Unsubscribed</title><body style=\"font-family:system-ui;background:#0b0f12;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\"><p>You've been unsubscribed. You won't receive any more alerts from us.</p></body>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (err) {
    console.error("[api/notifications/unsubscribe] GET error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
