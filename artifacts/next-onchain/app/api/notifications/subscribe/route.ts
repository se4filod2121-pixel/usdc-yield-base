import { NextRequest, NextResponse } from "next/server";
import { db, notificationSubscriptionsTable } from "@workspace/db";
import { randomUUID } from "crypto";
import { rateLimit } from "../../../../lib/rateLimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254;

// Single opt-in (no confirmation email round-trip): the checkbox the client
// shows next to this form is the consent record, and every email this
// address ever receives carries a one-click unsubscribe link built from the
// token generated here.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 10, windowMs: 60_000, routeName: "notifications-subscribe" });
  if (limited) return limited;

  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    await db
      .insert(notificationSubscriptionsTable)
      .values({ email, unsubscribeToken: randomUUID() })
      .onConflictDoNothing({ target: notificationSubscriptionsTable.email });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/notifications/subscribe] POST error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
