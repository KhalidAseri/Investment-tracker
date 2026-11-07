// daily-update: refreshes FX + prices, syncs IBKR Flex reports, and stores a daily snapshot.
// Called by pg_cron (x-cron-key header) for every user, or by the app with the user's JWT for that user only.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const FLEX_BASE = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";

type Row = Record<string, string>;
type Fx = Record<string, number>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const riyadhDate = (d = new Date()) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10);

// ---------- market data ----------
async function yahooQuote(symbol: string): Promise<{ price: number; currency: string } | null> {
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
        { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } },
      );
      if (!r.ok) continue;
      const j = await r.json();
      const meta = j?.chart?.result?.[0]?.meta;
      let price = meta?.regularMarketPrice;
      let currency = String(meta?.currency ?? "");
      if (typeof price !== "number" || !Number.isFinite(price)) continue;
      if (currency === "GBp" || currency === "GBX") {
        price = price / 100;
        currency = "GBP";
      }
      return { price, currency: currency.toUpperCase() };
    } catch (_) {
      // try next host
    }
  }
  return null;
}

async function refreshFx(admin: SupabaseClient): Promise<Fx> {
  const fx: Fx = { SAR: 1, USD: 3.75, AED: 3.75 / 3.6725 };
  const pairs: Record<string, string> = { GBP: "GBPUSD=X", EUR: "EURUSD=X", HKD: "HKDUSD=X", SGD: "SGDUSD=X", JPY: "JPYUSD=X" };
  const now = new Date().toISOString();
  const rows = [
    { currency: "SAR", rate_to_sar: 1, updated_at: now },
    { currency: "USD", rate_to_sar: 3.75, updated_at: now },
    { currency: "AED", rate_to_sar: fx.AED, updated_at: now },
  ];
  await Promise.all(
    Object.entries(pairs).map(async ([cur, sym]) => {
      const q = await yahooQuote(sym);
      if (q && q.price > 0) {
        fx[cur] = q.price * 3.75;
        rows.push({ currency: cur, rate_to_sar: fx[cur], updated_at: now });
      }
    }),
  );
  await admin.from("fx_rates").upsert(rows, { onConflict: "currency" });
  const { data } = await admin.from("fx_rates").select("currency, rate_to_sar");
  for (const r of data ?? []) if (!(r.currency in fx)) fx[r.currency] = Number(r.rate_to_sar);
  return fx;
}

// ---------- IBKR Flex ----------
const tagText = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : "";
};
const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
function elements(xml: string, name: string): Row[] {
  const out: Row[] = [];
  for (const m of xml.matchAll(new RegExp(`<${name}\\s([^>]*?)/?>`, "g"))) {
    const row: Row = {};
    for (const a of m[1].matchAll(/([A-Za-z0-9_]+)="([^"]*)"/g)) row[a[1]] = decode(a[2]);
    out.push(row);
  }
  return out;
}
const dateFrom = (v?: string) => {
  const d = String(v ?? "").replace(/[^0-9]/g, "").slice(0, 8);
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : riyadhDate();
};

async function fetchFlex(token: string, queryId: string): Promise<string> {
  const headers = { "User-Agent": "Mahfazati/1.0" };
  const r = await fetch(`${FLEX_BASE}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`, { headers });
  const t = await r.text();
  if (tagText(t, "Status") !== "Success") {
    throw new Error(tagText(t, "ErrorMessage") || "تعذّر طلب تقرير IBKR؛ تحقق من رقم التقرير والرمز");
  }
  const ref = tagText(t, "ReferenceCode");
  const url = tagText(t, "Url") || `${FLEX_BASE}/GetStatement`;
  for (let i = 0; i < 12; i++) {
    await sleep(i === 0 ? 2500 : 5000);
    const r2 = await fetch(`${url}?q=${encodeURIComponent(ref)}&t=${encodeURIComponent(token)}&v=3`, { headers });
    const x = await r2.text();
    if (x.includes("<FlexQueryResponse") || x.includes("<FlexStatements")) return x;
    const code = tagText(x, "ErrorCode");
    if (code && code !== "1019" && code !== "1018") throw new Error(tagText(x, "ErrorMessage") || `رمز خطأ IBKR ${code}`);
  }
  throw new Error("لم يكتمل تقرير IBKR في الوقت المحدد؛ أعد المحاولة بعد دقائق");
}

const baseSymbol = (s?: string | null) => String(s ?? "").split(".")[0].trim().toUpperCase();

async function syncIbkr(admin: SupabaseClient, uid: string, token: string, queryId: string, fx: Fx) {
  const xml = await fetchFlex(token, queryId);
  const positions = elements(xml, "OpenPosition").filter((p) => !p.levelOfDetail || p.levelOfDetail === "SUMMARY");
  const cash = elements(xml, "CashReportCurrency").filter((c) => c.currency && c.currency !== "BASE_SUMMARY");
  const trades = elements(xml, "Trade").filter((t) => !t.levelOfDetail || t.levelOfDetail === "EXECUTION");
  const cashTx = elements(xml, "CashTransaction").filter((c) => !c.levelOfDetail || c.levelOfDetail === "DETAIL");
  const rate = (cur?: string) => fx[String(cur ?? "SAR").toUpperCase()] ?? 1;

  let { data: acct } = await admin
    .from("accounts").select("id").eq("user_id", uid).eq("is_ibkr", true).order("sort").limit(1).maybeSingle();
  if (!acct) {
    const ins = await admin.from("accounts")
      .insert({ user_id: uid, name: "Interactive Brokers", kind: "broker", is_ibkr: true, sort: 1 }).select("id").single();
    acct = ins.data;
  }
  const accountId = acct!.id as string;

  const { data: holdingsData } = await admin.from("holdings").select("*").eq("user_id", uid);
  const holdings = (holdingsData ?? []) as Array<Record<string, any>>;
  const { data: safety } = await admin
    .from("sleeves").select("id").eq("user_id", uid).eq("layer", "safety").order("sort").limit(1).maybeSingle();

  const now = new Date().toISOString();
  const seen = new Set<string>();
  const byConid = new Map<string, Record<string, any>>();

  const upsertPosition = async (conid: string, symbol: string, name: string, qty: number, price: number, currency: string, sleeveId: string | null) => {
    seen.add(conid);
    let h = holdings.find((x) => x.ibkr_conid === conid);
    if (!h && symbol) {
      h = holdings.find((x) => !x.ibkr_conid && x.account_id === accountId && x.symbol && baseSymbol(x.symbol) === baseSymbol(symbol));
    }
    const patch = { ibkr_conid: conid, quantity: qty, price, currency, price_source: "ibkr", price_updated_at: now, archived: false };
    if (h) {
      await admin.from("holdings").update(patch).eq("id", h.id);
      byConid.set(conid, { ...h, ...patch });
    } else {
      const ins = await admin.from("holdings").insert({
        user_id: uid, account_id: accountId, sleeve_id: sleeveId, name, symbol, ...patch,
      }).select("*").single();
      if (ins.data) byConid.set(conid, ins.data);
    }
  };

  for (const p of positions) {
    if (!p.conid) continue;
    await upsertPosition(p.conid, p.symbol ?? "", p.description || p.symbol || p.conid, num(p.position), num(p.markPrice), (p.currency || "USD").toUpperCase(), null);
  }
  for (const c of cash) {
    const cur = c.currency.toUpperCase();
    const amount = num(c.endingCash ?? c.endingSettledCash);
    if (Math.abs(amount) < 0.01 && !holdings.some((h) => h.ibkr_conid === `CASH-${cur}`)) continue;
    await upsertPosition(`CASH-${cur}`, "", `نقد IBKR (${cur})`, amount, 1, cur, safety?.id ?? null);
  }
  // positions that disappeared from the report are now zero
  const stale = holdings.filter((h) => h.account_id === accountId && h.ibkr_conid && !seen.has(h.ibkr_conid) && Number(h.quantity) !== 0);
  for (const h of stale) await admin.from("holdings").update({ quantity: 0, price_updated_at: now }).eq("id", h.id);

  const txRows: Array<Record<string, unknown>> = [];
  for (const t of trades) {
    const id = t.tradeID || t.transactionID || t.ibExecID;
    if (!id) continue;
    const qty = num(t.quantity);
    const h = byConid.get(t.conid) ?? holdings.find((x) => x.ibkr_conid === t.conid);
    txRows.push({
      user_id: uid, account_id: accountId, holding_id: h?.id ?? null, sleeve_id: h?.sleeve_id ?? null,
      tx_date: dateFrom(t.tradeDate || t.dateTime), kind: qty >= 0 ? "buy" : "sell",
      amount_sar: round2(Math.abs(num(t.netCash || t.proceeds)) * rate(t.currency)),
      quantity: Math.abs(qty), price: num(t.tradePrice), currency: (t.currency || "USD").toUpperCase(),
      note: t.symbol || t.description || null, source: "ibkr", external_id: `T${id}`,
    });
  }
  for (const c of cashTx) {
    const id = c.transactionID;
    if (!id) continue;
    const amount = num(c.amount);
    const type = String(c.type ?? "");
    let kind = amount >= 0 ? "income" : "fee";
    if (/withholding/i.test(type)) kind = "tax";
    else if (/dividend|payment in lieu/i.test(type)) kind = "dividend";
    else if (/deposit|withdraw/i.test(type)) kind = amount >= 0 ? "deposit" : "withdrawal";
    else if (/fee|commission/i.test(type)) kind = "fee";
    else if (/interest/i.test(type)) kind = amount >= 0 ? "income" : "fee";
    const h = c.conid ? byConid.get(c.conid) ?? holdings.find((x) => x.ibkr_conid === c.conid) : undefined;
    txRows.push({
      user_id: uid, account_id: accountId, holding_id: h?.id ?? null, sleeve_id: h?.sleeve_id ?? null,
      tx_date: dateFrom(c.dateTime || c.settleDate || c.reportDate), kind,
      amount_sar: round2(Math.abs(amount) * rate(c.currency)), currency: (c.currency || "USD").toUpperCase(),
      note: [c.symbol, c.description].filter(Boolean).join(" · ") || type, source: "ibkr", external_id: `C${id}`,
    });
  }
  if (txRows.length) {
    const { error } = await admin.from("transactions").upsert(txRows, { onConflict: "user_id,external_id", ignoreDuplicates: true });
    if (error) throw new Error(`تعذّر حفظ العمليات: ${error.message}`);
  }
  return { positions: positions.length, cash: cash.length, transactions: txRows.length };
}

// ---------- prices + snapshot ----------
async function refreshPrices(admin: SupabaseClient, uid: string) {
  const { data } = await admin.from("holdings").select("id, symbol, currency")
    .eq("user_id", uid).eq("price_source", "yahoo").eq("archived", false);
  let updated = 0;
  const failed: string[] = [];
  const now = new Date().toISOString();
  await Promise.all((data ?? []).map(async (h) => {
    if (!h.symbol) return;
    const q = await yahooQuote(h.symbol);
    if (!q) { failed.push(h.symbol); return; }
    await admin.from("holdings").update({ price: q.price, currency: q.currency || h.currency, price_updated_at: now }).eq("id", h.id);
    updated++;
  }));
  return { updated, failed };
}

async function writeSnapshot(admin: SupabaseClient, uid: string, fx: Fx) {
  const [{ data: holdings }, { data: accounts }] = await Promise.all([
    admin.from("holdings").select("account_id, sleeve_id, quantity, price, currency, archived").eq("user_id", uid),
    admin.from("accounts").select("id, exclude_from_portfolio").eq("user_id", uid),
  ]);
  const excluded = new Set((accounts ?? []).filter((a) => a.exclude_from_portfolio).map((a) => a.id));
  const bySleeve: Record<string, number> = {};
  const byAccount: Record<string, number> = {};
  let total = 0;
  for (const h of holdings ?? []) {
    if (h.archived || (h.account_id && excluded.has(h.account_id))) continue;
    const v = Number(h.quantity) * Number(h.price) * (fx[String(h.currency).toUpperCase()] ?? 1);
    if (!Number.isFinite(v)) continue;
    total += v;
    const s = h.sleeve_id ?? "none";
    const a = h.account_id ?? "none";
    bySleeve[s] = round2((bySleeve[s] ?? 0) + v);
    byAccount[a] = round2((byAccount[a] ?? 0) + v);
  }
  const today = riyadhDate();
  await admin.from("snapshots").upsert(
    { user_id: uid, snap_date: today, total_sar: round2(total), by_sleeve: bySleeve, by_account: byAccount },
    { onConflict: "user_id,snap_date" },
  );
  if (total > 0) {
    await admin.from("plan_settings").update({ baseline_value: round2(total), baseline_date: today })
      .eq("user_id", uid).is("baseline_value", null);
  }
  return { total: round2(total), date: today };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let body: { mode?: string } = {};
  try { body = await req.json(); } catch (_) { /* empty body */ }
  const mode = body.mode ?? "all";

  let userIds: string[] = [];
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    const { data: key } = await admin.rpc("get_cron_key");
    if (!key || key !== cronKey) return json({ error: "unauthorized" }, 401);
    const { data } = await admin.from("plan_settings").select("user_id");
    userIds = (data ?? []).map((r) => r.user_id);
  } else {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data?.user) return json({ error: "unauthorized" }, 401);
    userIds = [data.user.id];
  }

  const fx = await refreshFx(admin);
  const results = [];
  for (const uid of userIds) {
    const res: Record<string, unknown> = {};
    if (mode === "all" || mode === "ibkr") {
      const { data: conn } = await admin.from("ibkr_connection").select("query_id, token").eq("user_id", uid).maybeSingle();
      if (conn?.token && conn?.query_id) {
        try {
          const r = await syncIbkr(admin, uid, conn.token, conn.query_id, fx);
          res.ibkr = r;
          await admin.from("ibkr_connection").update({
            last_sync_at: new Date().toISOString(), last_status: "ok",
            last_message: `${r.positions} مركز، ${r.transactions} عملية`,
          }).eq("user_id", uid);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          res.ibkr = { error: message };
          await admin.from("ibkr_connection").update({
            last_sync_at: new Date().toISOString(), last_status: "error", last_message: message,
          }).eq("user_id", uid);
        }
      } else if (mode === "ibkr") {
        res.ibkr = { error: "لم يُضبط ربط IBKR بعد" };
      }
    }
    if (mode === "all" || mode === "prices") res.prices = await refreshPrices(admin, uid);
    res.snapshot = await writeSnapshot(admin, uid, fx);
    results.push(res);
  }
  return json({ ok: true, results, fx });
});
