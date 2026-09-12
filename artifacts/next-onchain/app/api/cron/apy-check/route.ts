import { NextRequest, NextResponse } from "next/server";
import { db, notificationSubscriptionsTable, vaultApyStateTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "../../../../lib/resend";

const MORPHO_GRAPHQL = "https://blue-api.morpho.org/graphql";

// Kept as a small, stable, hand-maintained list rather than importing from
// the client-side vault picker (app/page.tsx is "use client" and carries UI
// concerns like logos/curator links this route doesn't need) — update both
// places if a vault is ever added or removed.
const TRACKED_VAULTS = [
  { address: "0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A", name: "Spark USDC" },
  { address: "0x616a4E1db48e22028f6bbf20444Cd3b8e3273738", name: "Seamless USDC" },
  { address: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183", name: "Steakhouse USDC" },
  { address: "0x27D8c7273fd3fcC6956a0B370cE5Fd4A7fc65c18", name: "Seamless WETH Vault" },
] as const;

// One percentage point of net APY — small day-to-day noise shouldn't trigger
// an email, only a move a subscriber would actually want to know about.
const APY_CHANGE_THRESHOLD = 0.01;
const MIN_RENOTIFY_INTERVAL_MS = 12 * 60 * 60 * 1000;

async function fetchNetApy(address: string): Promise<number | null> {
  try {
    const res = await fetch(MORPHO_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($address: String!) { vaultByAddress(address: $address, chainId: 8453) { state { netApy } } }`,
        variables: { address },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const netApy = json?.data?.vaultByAddress?.state?.netApy;
    return typeof netApy === "number" ? netApy : null;
  } catch {
    return null;
  }
}

// Triggered by Vercel Cron (see vercel.json). Vercel attaches
// `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is set
// on the project — this rejects anyone else who finds the URL.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Feature not configured yet — a no-op, not an error, so an unconfigured
    // deployment never fails a health check or alarms on this route.
    return NextResponse.json({ skipped: "CRON_SECRET not configured" });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await Promise.all(
    TRACKED_VAULTS.map(async (vault) => {
      const currentApy = await fetchNetApy(vault.address);
      return { vault, currentApy };
    })
  );

  const [priorStateRows, subscribers] = await Promise.all([
    db.select().from(vaultApyStateTable),
    db.select({ email: notificationSubscriptionsTable.email, unsubscribeToken: notificationSubscriptionsTable.unsubscribeToken })
      .from(notificationSubscriptionsTable),
  ]);
  const priorState = new Map(priorStateRows.map((r) => [r.vaultAddress, r]));

  const now = Date.now();
  const changed: { name: string; from: number; to: number }[] = [];

  for (const { vault, currentApy } of results) {
    if (currentApy == null) continue;
    const prior = priorState.get(vault.address);
    if (!prior) {
      await db.insert(vaultApyStateTable).values({ vaultAddress: vault.address, lastNotifiedApy: currentApy });
      continue;
    }
    const delta = Math.abs(currentApy - prior.lastNotifiedApy);
    const cooledDown = now - prior.lastNotifiedAt.getTime() >= MIN_RENOTIFY_INTERVAL_MS;
    if (delta >= APY_CHANGE_THRESHOLD && cooledDown) {
      changed.push({ name: vault.name, from: prior.lastNotifiedApy, to: currentApy });
      await db
        .update(vaultApyStateTable)
        .set({ lastNotifiedApy: currentApy, lastNotifiedAt: new Date() })
        .where(eq(vaultApyStateTable.vaultAddress, vault.address));
    }
  }

  if (changed.length === 0 || subscribers.length === 0) {
    return NextResponse.json({ checked: results.length, changed: changed.length, notified: 0 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://onbase-finance.vercel.app";
  const changesHtml = changed
    .map((c) => `<li><strong>${c.name}</strong>: ${(c.from * 100).toFixed(2)}% → ${(c.to * 100).toFixed(2)}%</li>`)
    .join("");

  let notified = 0;
  for (const sub of subscribers) {
    const html = `
      <p>A vault you're tracking on USDC Yield on Base just moved:</p>
      <ul>${changesHtml}</ul>
      <p><a href="${appUrl}">Open the app</a></p>
      <p style="color:#888;font-size:12px">
        <a href="${appUrl}/api/notifications/unsubscribe?token=${sub.unsubscribeToken}">Unsubscribe</a>
      </p>`;
    const sent = await sendEmail({ to: sub.email, subject: "Vault APY update", html });
    if (sent) notified += 1;
  }

  return NextResponse.json({ checked: results.length, changed: changed.length, notified });
}
