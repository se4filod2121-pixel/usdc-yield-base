// Thin wrapper around Resend's REST API — no SDK dependency needed for one
// call. Silently no-ops (returns false) whenever RESEND_API_KEY isn't
// configured, matching this app's established pattern for optional
// third-party integrations (see lib/rateLimit.ts's sibling API routes):
// a missing credential degrades the feature, it never breaks the request
// that triggered it.
export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html }),
    });
    return res.ok;
  } catch (err) {
    console.error("[resend] send failed:", err);
    return false;
  }
}
