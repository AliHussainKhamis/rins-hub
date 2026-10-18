// RINS Hub assistant — Supabase Edge Function named "assistant".
// It reads the hub's data as the signed-in user (the same access rules apply),
// asks Claude the question, and returns the answer. It never changes data.
//
// Needs one secret in Supabase (Edge Functions > Secrets):
//   ANTHROPIC_API_KEY   your key from console.anthropic.com
// Optional:
//   CLAUDE_MODEL        defaults to claude-sonnet-5-5

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Row = Record<string, any>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "The assistant has no Claude API key yet. Add ANTHROPIC_API_KEY under Edge Functions > Secrets." }, 500);

  // Act as the person who called, so the database access rules apply to them.
  // Use the same public key the website sent (works with new and legacy keys).
  const publicKey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, publicKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Sign in first." }, 401);
  const member = await sb.from("hub_users").select("email").limit(1);
  if (!member.data?.length) return json({ error: "Your account is not on this hub's list of users." }, 403);

  let question = "", history: { role: string; content: string }[] = [];
  try {
    const body = await req.json();
    question = String(body.question ?? "").trim().slice(0, 2000);
    if (Array.isArray(body.history)) {
      history = body.history
        .filter((m: Row) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-8)
        .map((m: Row) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    }
  } catch { /* handled below */ }
  while (history.length && history[0].role !== "user") history.shift();
  if (!question) return json({ error: "Ask a question." }, 400);

  // Load the data (paged, in case the log grows past 1,000 rows).
  async function all(table: string): Promise<Row[]> {
    const out: Row[] = [];
    for (let i = 0; ; i += 1000) {
      const { data, error } = await sb.from(table).select("*").order("created_at").range(i, i + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  let products: Row[], locations: Row[], movements: Row[];
  try {
    [products, locations, movements] = await Promise.all(["products", "locations", "movements"].map(all));
  } catch (e) {
    return json({ error: "Could not read the hub data: " + (e as Error).message }, 500);
  }

  // Same stock calculation as the web page.
  const pName = (id: string) => products.find((p) => p.id === id)?.name ?? "Unknown";
  const lName = (id: string) => locations.find((l) => l.id === id)?.name ?? "Unknown";
  const stock: Record<string, Record<string, number>> = {};
  const add = (p: string, l: string | null, q: number) => {
    if (!p || !l) return;
    (stock[p] ??= {})[l] = (stock[p][l] ?? 0) + q;
  };
  for (const m of movements) {
    const q = Number(m.qty) || 0;
    if (m.type === "in") add(m.product_id, m.to_loc, q);
    else if (m.type === "transfer" || m.type === "return") { add(m.product_id, m.from_loc, -q); add(m.product_id, m.to_loc, q); }
    else if (m.type === "sale") add(m.product_id, m.from_loc, -q);
    else if (m.type === "adjust") add(m.product_id, m.from_loc, q);
  }
  const stockRows = Object.entries(stock).flatMap(([p, locs]) =>
    Object.entries(locs).map(([l, qty]) => ({
      product: pName(p),
      location: lName(l),
      locationType: locations.find((x) => x.id === l)?.type,
      qty,
      reorderAt: products.find((x) => x.id === p)?.reorder_at ?? 10,
    }))
  );
  const sales = movements
    .filter((m) => m.type === "sale")
    .slice(-500)
    .map((m) => ({ date: m.date, location: lName(m.from_loc), product: pName(m.product_id), qty: m.qty, unitPrice: m.price }));

  const data = {
    today: new Date().toISOString().slice(0, 10),
    currency: "BHD",
    products: products.map((p) => ({ name: p.name, sku: p.sku, line: p.line, price: p.price, unit: p.unit })),
    locations: locations.map((l) => ({ name: l.name, chain: l.chain, type: l.type, format: l.format, display: l.display })),
    stock: stockRows,
    sales,
  };

  const system =
    "You are the operations assistant for RINS W.L.L, a Bahrain travel hygiene brand " +
    "(Pocket Bidet cap; Classic Fusion disposable bath towels and toilet seat covers). " +
    "Stock held in retail stores is on consignment and still belongs to RINS. " +
    "Answer using only the data provided. Be brief and concrete, show money in BHD with 3 decimals, " +
    "and say plainly when the data does not cover the question. When asked to draft a message, " +
    "write it ready to send. Plain text only, no markdown.\n\nDATA:\n" + JSON.stringify(data);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-5-5",
      max_tokens: 1200,
      system,
      messages: [...history, { role: "user", content: question }],
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: "Claude returned an error: " + (out?.error?.message ?? res.status) }, 502);
  const answer = (out.content ?? []).filter((b: Row) => b.type === "text").map((b: Row) => b.text).join("").trim();
  return json({ answer: answer || "No answer came back." });
});
