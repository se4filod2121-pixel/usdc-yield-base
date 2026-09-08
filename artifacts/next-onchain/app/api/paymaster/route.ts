export async function POST(req: Request) {
  const url = process.env.PAYMASTER_RPC_URL;
  if (!url) {
    return new Response(
      JSON.stringify({ error: "Paymaster not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await req.json();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
