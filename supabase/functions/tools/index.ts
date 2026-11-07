// tools: on-demand helpers for the app (signed-in users only).
//  - history: daily closes for a benchmark symbol (Yahoo), for the performance comparison
//  - parse-drahim: reads a Drahim monthly investment report (PDF) into holdings, operations and fees
import { createClient } from "npm:@supabase/supabase-js@2";
import { getDocumentProxy } from "npm:unpdf@0.12.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const REQUIRE_USER = true;

// ---------- benchmark history ----------
async function history(symbol: string, fromISO: string) {
  const p1 = Math.floor(new Date(fromISO + "T00:00:00Z").getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d&events=div`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (!r.ok) continue;
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      const ts: number[] = res?.timestamp ?? [];
      const adj: Array<number | null> = res?.indicators?.adjclose?.[0]?.adjclose ?? res?.indicators?.quote?.[0]?.close ?? [];
      const points = ts.map((t, i) => ({ d: new Date((t + 3 * 3600) * 1000).toISOString().slice(0, 10), c: adj[i] }))
        .filter((p) => typeof p.c === "number" && Number.isFinite(p.c)) as Array<{ d: string; c: number }>;
      return { name: String(res?.meta?.longName ?? res?.meta?.shortName ?? symbol), points };
    } catch (_) { /* next host */ }
  }
  return { name: symbol, points: [] };
}

// ---------- Drahim report ----------
async function pdfLines(bytes: Uint8Array): Promise<Array<{ page: number; cells: string[] }>> {
  const pdf = await getDocumentProxy(bytes);
  const out: Array<{ page: number; cells: string[] }> = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; s: string }>>();
    for (const it of tc.items as Array<{ str: string; transform: number[] }>) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      rows.set(key, [...(rows.get(key) ?? []), { x: Math.round(it.transform[4]), s: it.str.normalize("NFKC").replace(/[\u0000-\u001f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim() }]);
    }
    for (const [, items] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      out.push({ page: p, cells: items.sort((a, b) => b.x - a.x).map((i) => i.s).filter(Boolean) }); // right-to-left reading order
    }
  }
  return out;
}

const MONTHS: Record<string, string> = {
  "يناير": "01", "فبراير": "02", "مارس": "03", "أبريل": "04", "ابريل": "04", "مايو": "05", "يونيو": "06",
  "يوليو": "07", "أغسطس": "08", "اغسطس": "08", "سبتمبر": "09", "أكتوبر": "10", "اكتوبر": "10", "نوفمبر": "11", "ديسمبر": "12",
};
const numOf = (s: string) => {
  const m = s.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};
const isHeader = (cells: string[]) => cells.length === 1 && !/\d/.test(cells[0]) && cells[0].length > 3;
const OP_KIND: Array<[RegExp, string]> = [
  [/أرباح|توزيع/, "dividend"], [/سحب/, "withdrawal"], [/إيداع|ايداع|تحويل وارد/, "deposit"], [/رسوم|عمولة/, "fee"], [/زكاة/, "zakat"],
];

function parseDrahim(lines: Array<{ page: number; cells: string[] }>) {
  let period: string | null = null, periodLabel: string | null = null, total: number | null = null, section: string | null = null;
  const holdings: Array<{ portfolio: string | null; name: string; units: number; value: number }> = [];
  const operations: Array<{ portfolio: string | null; date: string; kind: string; label: string; amount: number }> = [];
  const fees: Array<{ portfolio: string | null; amount: number; label: string }> = [];
  for (const { cells } of lines) {
    const text = cells.join(" ");
    if (cells.includes("فترة التقرير")) {
      for (const c of cells) {
        const m = c.match(/^(\S+)\s+(\d{4})$/);
        if (m && MONTHS[m[1]]) { periodLabel = c; period = `${m[2]}-${MONTHS[m[1]]}`; }
      }
    }
    if (cells.includes("إجمالي قيمة استثماراتك")) total = numOf(cells[0]);
    if (isHeader(cells)) { section = cells[0]; continue; }
    // holdings row: [pct, value, units, name]
    if (cells.length === 4 && /%$/.test(cells[0]) && /ر\.?س/.test(cells[1]) && cells[3] !== "مجموع" && Number.isFinite(numOf(cells[2]))) {
      holdings.push({ portfolio: section, name: cells[3], units: numOf(cells[2]), value: numOf(cells[1]) });
      continue;
    }
    // operations row: [amount, label, dd-mm-yyyy]
    const dm = cells.length === 3 ? cells[2].match(/^(\d{2})-(\d{2})-(\d{4})$/) : null;
    if (dm) {
      const label = cells[1];
      const kind = OP_KIND.find(([re]) => re.test(label))?.[1] ?? "other";
      operations.push({ portfolio: section, date: `${dm[3]}-${dm[2]}-${dm[1]}`, kind, label, amount: Math.abs(numOf(cells[0])) });
      continue;
    }
    const fee = text.match(/استقطاع مبلغ\s*([\d.,]+).*?(مشاركة أرباح|رسوم)[^م]*(?:من محفظة\s*(.+?))?\s*\.?$/);
    if (fee) fees.push({ portfolio: fee[3]?.trim() || section, amount: numOf(fee[1]), label: fee[2] });
  }
  return { provider: "drahim", period, periodLabel, total, holdings, operations, fees };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (REQUIRE_USER) {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data?.user) return json({ error: "unauthorized" }, 401);
  }
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* empty */ }
  try {
    if (body.mode === "history") {
      const symbol = String(body.symbol ?? "").trim().slice(0, 30);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(body.from)) ? String(body.from) : new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
      return json({ ok: true, ...(symbol ? await history(symbol, from) : { name: "", points: [] }) });
    }
    if (body.mode === "parse-drahim") {
      const b64 = String(body.pdf ?? "");
      if (!b64 || b64.length > 8_000_000) return json({ error: "الملف فارغ أو أكبر من المسموح" }, 400);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const parsed = parseDrahim(await pdfLines(bytes));
      if (!parsed.holdings.length && !parsed.operations.length) return json({ ok: false, error: "لم أتعرف على هذا الملف. ارفع تقرير الاستثمارات الشهري من دراهم." });
      return json({ ok: true, ...parsed });
    }
  } catch (e) {
    return json({ ok: false, error: "تعذّرت قراءة الملف: " + (e instanceof Error ? e.message : String(e)) }, 400);
  }
  return json({ error: "unknown mode" }, 400);
});
