// daily-update: refreshes FX + prices, syncs IBKR Flex reports, and stores a daily snapshot.
// Called by pg_cron (x-cron-key header) for every user, or by the app with the user's JWT for that user only.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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
async function yahooQuote(symbol: string): Promise<{ price: number; currency: string; name: string; type: string; exchange: string } | null> {
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
      return {
        price, currency: currency.toUpperCase(), name: String(meta?.longName ?? meta?.shortName ?? symbol),
        type: String(meta?.instrumentType ?? ""), exchange: String(meta?.fullExchangeName ?? meta?.exchangeName ?? ""),
      };
    } catch (_) {
      // try next host
    }
  }
  return null;
}

/** Raw quotes from Yahoo's symbol search (shared by the search box and the instrument profiles); null when both hosts fail. */
async function yahooSearchRaw(q: string, count = 12): Promise<Array<Record<string, unknown>> | null> {
  for (const host of ["query2", "query1"]) {
    try {
      const r = await fetch(
        `https://${host}.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${count}&newsCount=0&listsCount=0`,
        { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } },
      );
      if (!r.ok) continue;
      const j = await r.json();
      return (j?.quotes ?? []) as Array<Record<string, unknown>>;
    } catch (_) {
      // try the other host
    }
  }
  return null;
}

/** Symbol search: tickers like 2222 or ISWD, or names in English. */
async function yahooSearch(q: string) {
  return ((await yahooSearchRaw(q)) ?? [])
    .filter((x) => x.symbol && ["EQUITY", "ETF", "MUTUALFUND", "INDEX", "CURRENCY", "CRYPTOCURRENCY"].includes(String(x.quoteType)))
    .map((x) => ({
      symbol: String(x.symbol), name: String(x.longname ?? x.shortname ?? x.symbol),
      exchange: String(x.exchDisp ?? x.exchange ?? ""), type: String(x.quoteType),
    }));
}

async function refreshFx(admin: SupabaseClient): Promise<Fx> {
  const fx: Fx = { SAR: 1, USD: 3.75, AED: 3.75 / 3.6725 };
  const pairs: Record<string, string> = { GBP: "GBPUSD=X", EUR: "EURUSD=X", HKD: "HKDUSD=X", SGD: "SGDUSD=X", JPY: "JPYUSD=X" };
  // any other currency a holding is priced in (e.g. CHF, KWD from a market search)
  const { data: held } = await admin.from("holdings").select("currency");
  for (const c of new Set((held ?? []).map((r) => String(r.currency ?? "").toUpperCase()))) {
    if (/^[A-Z]{3}$/.test(c) && !(c in pairs) && !(c in fx)) pairs[c] = `${c}USD=X`;
  }
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
      .insert({ user_id: uid, name: "Interactive Brokers", kind: "broker", is_ibkr: true, country: "INTL", sort: 1 }).select("id").single();
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
  // first link: positions already owned are brought in as transfers, so they don't count as profit
  const firstSync = !holdings.some((x) => x.ibkr_conid);
  const addRows: Array<Record<string, unknown>> = [];

  const upsertPosition = async (conid: string, symbol: string, name: string, qty: number, price: number, currency: string, sleeveId: string | null, costSar: number | null = null) => {
    seen.add(conid);
    let h = holdings.find((x) => x.ibkr_conid === conid);
    if (!h && symbol) {
      h = holdings.find((x) => !x.ibkr_conid && x.account_id === accountId && x.symbol && baseSymbol(x.symbol) === baseSymbol(symbol));
    }
    const patch: Record<string, unknown> = { ibkr_conid: conid, quantity: qty, price, currency, price_source: "ibkr", price_updated_at: now, archived: false, ...(costSar != null && costSar > 0 ? { cost_basis: Math.round(costSar * 100) / 100 } : {}) };
    if (h) {
      await admin.from("holdings").update(patch).eq("id", h.id);
      byConid.set(conid, { ...h, ...patch });
    } else {
      const ins = await admin.from("holdings").insert({
        user_id: uid, account_id: accountId, sleeve_id: sleeveId, name, symbol, ...patch,
      }).select("*").single();
      if (ins.data) byConid.set(conid, ins.data);
      if (ins.data && firstSync && Math.abs(qty * price) > 0) {
        addRows.push({ user_id: uid, account_id: accountId, holding_id: ins.data.id, sleeve_id: sleeveId, tx_date: riyadhDate(), kind: "transfer",
          amount_sar: round2(qty * price * rate(currency)), currency: "SAR", note: `إضافة أصل قائم: ${name}`, source: "ibkr", external_id: `A${conid}` });
      }
    }
  };

  for (const p of positions) {
    if (!p.conid) continue;
    await upsertPosition(p.conid, p.symbol ?? "", p.description || p.symbol || p.conid, num(p.position), num(p.markPrice), (p.currency || "USD").toUpperCase(), null,
      p.costBasisMoney != null && p.costBasisMoney !== "" ? Math.abs(num(p.costBasisMoney)) * rate(p.currency || "USD") : null);
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
  txRows.push(...addRows);
  if (txRows.length) {
    const { error } = await admin.from("transactions").upsert(txRows, { onConflict: "user_id,external_id", ignoreDuplicates: true });
    if (error) throw new Error(`تعذّر حفظ العمليات: ${error.message}`);
  }
  return { positions: positions.length, cash: cash.length, transactions: txRows.length };
}

/** Mubasher's published price file of a Saudi mutual fund (one "YYYY/MM/DD…,NAV" line per day, oldest first). */
const mubasherCsvUrl = (fundId: string) =>
  `https://static.mubasher.info/File.MubasherCharts/File.Mutual_Fund_Charts_Dir/priceChartFund_${fundId.trim()}.csv`;

async function fundNav(fundId: string): Promise<{ price: number; date: string } | null> {
  if (!/^\d+$/.test(fundId.trim())) return null;
  try {
    const r = await fetch(
      mubasherCsvUrl(fundId),
      { headers: { "User-Agent": BROWSER_UA } },
    );
    if (!r.ok) return null;
    const last = (await r.text()).trim().split(/\r?\n/).pop() ?? "";
    const m = last.match(/^(\d{4})\/(\d{2})\/(\d{2})[^,]*,\s*([\d.]+)/);
    if (!m) return null;
    const price = Number(m[4]);
    return Number.isFinite(price) && price > 0 ? { price, date: `${m[1]}-${m[2]}-${m[3]}` } : null;
  } catch (_) {
    return null;
  }
}

// ---------- market history cache («المستشار») ----------
// Monthly histories, the yield curve and instrument facts, cached in market_series / market_facts / instrument_profiles and
// shared by every user. Same endpoints and headers as above (Yahoo chart and search, Mubasher's price file), small batches
// (≤ 20 items per call, 4 requests at a time). A row is fetched again only when old: series after 6 days, profiles after
// 30; a failed fetch is retried after a day (profiles: a week) and never replaces history already held.
const MAX_MARKET_ITEMS = 20;
const SERIES_FRESH_DAYS = 6;
const PROFILE_FRESH_DAYS = 30;
const RATE_SYMBOLS = new Set(["^IRX", "^FVX", "^TNX", "^TYX"]);
const CURVE: Array<[string, string]> = [["us_3m", "^IRX"], ["us_5y", "^FVX"], ["us_10y", "^TNX"], ["us_30y", "^TYX"]];
type MonthRow = [string, number, number, number];

const ageDays = (iso: unknown) => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? (Date.now() - t) / 86400000 : Infinity;
};
const sig7 = (n: number) => Number(n.toPrecision(7));
const isFundId = (s: string) => /^\d{1,10}$/.test(s);
const isYahooSymbol = (s: string) => /^[A-Z0-9^.=_-]{1,30}$/.test(s) && !isFundId(s);
const marketList = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim()).filter(Boolean))];

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

/** The chart endpoint with any query (same hosts and headers as yahooQuote). */
async function yahooChart(symbol: string, query: string): Promise<Record<string, any> | null> {
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`,
        { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } },
      );
      if (!r.ok) continue;
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      if (res) return res;
    } catch (_) {
      // try next host
    }
  }
  return null;
}

/**
 * Whole monthly history: close, adjusted close (dividends reinvested) and dividends paid in each month. A bar's month is
 * read in the exchange's local time (+6 h, so a bar at local midnight never slips into the month before); the running
 * month holds the latest price. Yield symbols (^IRX, ^FVX, ^TNX, ^TYX) are kept as yields in % (kind 'rate').
 */
async function yahooMonthly(symbol: string) {
  const res = await yahooChart(symbol, "range=max&interval=1mo&events=div");
  if (!res) return null;
  const meta = res.meta ?? {};
  const rate = RATE_SYMBOLS.has(symbol);
  const ts: number[] = res.timestamp ?? [];
  const close: Array<number | null> = res.indicators?.quote?.[0]?.close ?? [];
  const adj: Array<number | null> = res.indicators?.adjclose?.[0]?.adjclose ?? close;
  let currency = String(meta.currency ?? "");
  const scale = currency === "GBp" || currency === "GBX" ? 0.01 : 1;
  if (scale !== 1) currency = "GBP";
  const off = Number(meta.gmtoffset) || 0;
  const thisMonth = riyadhDate().slice(0, 7);
  const monthOf = (t: number) => {
    const m = new Date((t + off + 6 * 3600) * 1000).toISOString().slice(0, 7);
    return m > thisMonth ? thisMonth : m;
  };
  const divs = new Map<string, number>();
  if (!rate) {
    for (const d of Object.values(res.events?.dividends ?? {}) as Array<{ amount?: number; date?: number }>) {
      const amount = Number(d?.amount), t = Number(d?.date);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(t)) continue;
      const m = monthOf(t);
      divs.set(m, (divs.get(m) ?? 0) + amount * scale);
    }
  }
  const byMonth = new Map<string, MonthRow>();
  ts.forEach((t, i) => {
    const c = close[i];
    if (typeof c !== "number" || !Number.isFinite(c) || (rate ? c < -5 : c <= 0)) return;
    const a = adj[i];
    const m = monthOf(t);
    const cc = rate ? c : c * scale;
    const aa = rate ? c : typeof a === "number" && Number.isFinite(a) && a > 0 ? a * scale : cc;
    byMonth.set(m, [m, sig7(cc), sig7(aa), rate ? 0 : sig7(divs.get(m) ?? 0)]); // a later bar of the same month wins
  });
  const points = [...byMonth.values()].sort((x, y) => x[0].localeCompare(y[0]));
  if (!points.length) return null;
  return {
    kind: rate ? "rate" : "price", currency: currency ? currency.toUpperCase() : null, points,
    meta: {
      name: String(meta.longName ?? meta.shortName ?? symbol), exchange: String(meta.fullExchangeName ?? meta.exchangeName ?? ""),
      type: String(meta.instrumentType ?? ""), source: "yahoo", first: points[0][0], last: points[points.length - 1][0], count: points.length,
    },
  };
}

/** Daily NAVs from Mubasher's price file reduced to the last NAV of each month (same file and line format as fundNav). */
async function fundNavMonthly(fundId: string) {
  if (!isFundId(fundId)) return null;
  try {
    const r = await fetch(mubasherCsvUrl(fundId), { headers: { "User-Agent": BROWSER_UA } });
    if (!r.ok) return null;
    const last = new Map<string, { day: string; nav: number }>();
    for (const line of (await r.text()).split(/\r?\n/)) {
      const m = line.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})[^,]*,\s*([\d.]+)/);
      if (!m) continue;
      const nav = Number(m[4]);
      if (!Number.isFinite(nav) || nav <= 0) continue;
      const day = `${m[1]}-${m[2]}-${m[3]}`;
      const cur = last.get(day.slice(0, 7));
      if (!cur || day >= cur.day) last.set(day.slice(0, 7), { day, nav });
    }
    const points: MonthRow[] = [...last.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => [m, sig7(v.nav), sig7(v.nav), 0]);
    if (!points.length) return null;
    const lastDay = [...last.values()].map((v) => v.day).sort().pop() ?? null;
    return { kind: "nav", currency: "SAR", points, meta: { source: "mubasher", first: points[0][0], last: points[points.length - 1][0], count: points.length, last_date: lastDay } };
  } catch (_) {
    return null;
  }
}

/** Country of a listing from the symbol suffix or the exchange code (mirror of the app's countries.ts countryOfListing). */
const SUFFIX_COUNTRY: Record<string, string> = {
  SR: "SA", AE: "AE", KW: "KW", QA: "QA", CA: "EG", L: "GB", IL: "GB", DE: "DE", F: "DE", BE: "DE", DU: "DE", HM: "DE", HA: "DE", MU: "DE",
  SG: "DE", PA: "FR", AS: "NL", BR: "BE", MI: "IT", MC: "ES", LS: "PT", SW: "CH", VX: "CH", ST: "SE", CO: "DK", OL: "NO", HE: "FI",
  IR: "IE", VI: "AT", WA: "PL", PR: "CZ", BD: "HU", AT: "GR", IS: "TR", ME: "RU", T: "JP", AX: "AU", NZ: "NZ", HK: "HK", SI: "SG",
  SS: "CN", SZ: "CN", NS: "IN", BO: "IN", JK: "ID", KS: "KR", KQ: "KR", KL: "MY", PS: "PH", TW: "TW", TWO: "TW", BK: "TH", VN: "VN",
  TO: "CA", V: "CA", NE: "CA", CN: "CA", SA: "BR", MX: "MX", SN: "CL", BA: "AR", LM: "PE", JO: "ZA", TA: "IL",
};
const EXCHANGE_COUNTRY: Record<string, string> = {
  NMS: "US", NGM: "US", NCM: "US", NYQ: "US", NYS: "US", ASE: "US", PCX: "US", BTS: "US", PNK: "US", OQB: "US", OQX: "US", NAS: "US", CBO: "US",
  SAU: "SA", DFM: "AE", ADX: "AE", KUW: "KW", DOH: "QA", BAH: "BH", MSM: "OM", CAI: "EG", LSE: "GB", IOB: "GB", GER: "DE", FRA: "DE",
  PAR: "FR", AMS: "NL", BRU: "BE", MIL: "IT", MCE: "ES", LIS: "PT", EBS: "CH", VTX: "CH", STO: "SE", CPH: "DK", OSL: "NO", HEL: "FI",
  ISE: "IE", VIE: "AT", WSE: "PL", ATH: "GR", IST: "TR", JPX: "JP", TYO: "JP", ASX: "AU", NZE: "NZ", HKG: "HK", SES: "SG", SHH: "CN",
  SHZ: "CN", NSI: "IN", BSE: "IN", JKT: "ID", KSC: "KR", KOE: "KR", KLS: "MY", PHS: "PH", TAI: "TW", TWO: "TW", SET: "TH", TOR: "CA",
  VAN: "CA", CNQ: "CA", NEO: "CA", SAO: "BR", MEX: "MX", SGO: "CL", BUE: "AR", LIM: "PE", JNB: "ZA", TLV: "IL",
};
function countryOf(symbol: string, exchange: string | null): string | null {
  const s = symbol.toUpperCase();
  if (isFundId(s)) return "SA";
  const dot = s.lastIndexOf(".");
  if (dot > 0 && SUFFIX_COUNTRY[s.slice(dot + 1)]) return SUFFIX_COUNTRY[s.slice(dot + 1)];
  const ex = (exchange ?? "").toUpperCase();
  if (ex && EXCHANGE_COUNTRY[ex]) return EXCHANGE_COUNTRY[ex];
  return dot < 0 && !s.startsWith("^") ? "US" : null;
}

/** mode 'series' {symbols, funds}: monthly histories of up to 20 items; returns every requested row. */
async function marketSeries(admin: SupabaseClient, body: Record<string, unknown>) {
  const funds = marketList(body.funds).filter(isFundId);
  const symbols = marketList(body.symbols).map((s) => s.toUpperCase()).filter(isYahooSymbol);
  const keys = [...funds.map((key) => ({ key, fund: true })), ...symbols.map((key) => ({ key, fund: false }))].slice(0, MAX_MARKET_ITEMS);
  if (!keys.length) return { ok: true, rows: [], refreshed: [], failed: [] };
  const { data: existing } = await admin.from("market_series").select("symbol, updated_at, meta").in("symbol", keys.map((k) => k.key));
  const have = new Map((existing ?? []).map((r) => [String(r.symbol), r]));
  const fresh = (k: string) => {
    const r = have.get(k);
    if (!r) return false;
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    if (ageDays(meta.failed_at) < 1) return true;
    return ageDays(r.updated_at) < (Number(meta.count) > 0 ? SERIES_FRESH_DAYS : 1);
  };
  const now = new Date().toISOString();
  const refreshed: string[] = [], failed: string[] = [];
  const rows = (await pool(keys.filter((k) => !fresh(k.key)), 4, async (k) => {
    const got = k.fund ? await fundNavMonthly(k.key) : await yahooMonthly(k.key);
    if (got) {
      refreshed.push(k.key);
      return { symbol: k.key, kind: got.kind, currency: got.currency, points: got.points, meta: got.meta, updated_at: now };
    }
    failed.push(k.key);
    const prev = have.get(k.key);
    const prevMeta = (prev?.meta ?? {}) as Record<string, unknown>;
    if (prev && Number(prevMeta.count) > 0) {
      // keep the history already held and try again tomorrow
      await admin.from("market_series").update({ meta: { ...prevMeta, failed_at: now } }).eq("symbol", k.key);
      return null;
    }
    return { symbol: k.key, kind: k.fund ? "nav" : RATE_SYMBOLS.has(k.key) ? "rate" : "price", currency: null, points: [],
      meta: { error: "unavailable", count: 0, failed_at: now }, updated_at: now };
  })).filter((r): r is NonNullable<typeof r> => !!r);
  if (rows.length) {
    const { error } = await admin.from("market_series").upsert(rows, { onConflict: "symbol" });
    if (error) return { ok: false, error: error.message, rows, refreshed, failed };
  }
  const { data: all } = await admin.from("market_series").select("symbol, kind, currency, points, meta, updated_at").in("symbol", keys.map((k) => k.key));
  return { ok: true, rows: all ?? rows, refreshed, failed };
}

/** mode 'profile' {symbols}: Yahoo search facts (quote type, sector, industry, exchange) and the listing country, up to 20. */
async function marketProfiles(admin: SupabaseClient, body: Record<string, unknown>) {
  const symbols = marketList(body.symbols).map((s) => s.toUpperCase()).filter(isYahooSymbol).slice(0, MAX_MARKET_ITEMS);
  if (!symbols.length) return { ok: true, rows: [], failed: [] };
  const { data: existing } = await admin.from("instrument_profiles").select("symbol, data, updated_at").in("symbol", symbols);
  const have = new Map((existing ?? []).map((r) => [String(r.symbol), r]));
  const todo = symbols.filter((s) => {
    const r = have.get(s);
    return !r || ageDays(r.updated_at) >= ((r.data as Record<string, unknown> | null)?.error ? 7 : PROFILE_FRESH_DAYS);
  });
  const now = new Date().toISOString();
  const failed: string[] = [];
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const rows = (await pool(todo, 3, async (sym) => {
    const quotes = await yahooSearchRaw(sym, 6);
    if (quotes == null) { failed.push(sym); return null; } // Yahoo unreachable: write nothing
    const q = quotes.find((x) => String(x.symbol ?? "").toUpperCase() === sym);
    if (!q) failed.push(sym);
    const exchange = q ? str(q.exchange) : null;
    const data = q
      ? { quote_type: str(q.quoteType), sector: str(q.sector) ?? str(q.sectorDisp), industry: str(q.industryDisp) ?? str(q.industry), exchange,
        exchange_name: str(q.exchDisp), name: str(q.longname) ?? str(q.shortname), country: countryOf(sym, exchange) }
      : { quote_type: null, sector: null, industry: null, exchange: null, exchange_name: null, name: null, country: countryOf(sym, null), error: "not_found" };
    return { symbol: sym, data, source: "yahoo", updated_at: now };
  })).filter((r): r is NonNullable<typeof r> => !!r);
  if (rows.length) await admin.from("instrument_profiles").upsert(rows, { onConflict: "symbol" });
  const { data: all } = await admin.from("instrument_profiles").select("symbol, data, source, updated_at").in("symbol", symbols);
  return { ok: true, rows: all ?? rows, failed };
}

/** Morning job: today's US Treasury yields (3 months, 5, 10 and 30 years, %) → market_facts, at most once in 12 hours. */
async function refreshCurve(admin: SupabaseClient) {
  const { data } = await admin.from("market_facts").select("key, updated_at").in("key", CURVE.map((c) => c[0]));
  if ((data ?? []).length === CURVE.length && (data ?? []).every((r) => ageDays(r.updated_at) < 0.5)) return { skipped: true };
  const now = new Date().toISOString();
  const rows: Array<Record<string, unknown>> = [];
  for (const [key, sym] of CURVE) {
    const q = await yahooQuote(sym);
    if (!q || !Number.isFinite(q.price)) continue;
    const v = q.price > 25 ? q.price / 10 : q.price; // the old ×10 quote convention
    rows.push({ key, value: Math.round(v * 1000) / 1000, meta: { symbol: sym, source: "yahoo" }, as_of: riyadhDate(), updated_at: now });
  }
  if (rows.length) await admin.from("market_facts").upsert(rows, { onConflict: "key" });
  return { updated: rows.map((r) => r.key) };
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
  // Saudi mutual funds (e.g. Al Rajhi): last published NAV from Mubasher's fund price file.
  // Only moves forward: an older published price never overwrites a newer one the owner typed in.
  const { data: funds } = await admin.from("holdings").select("id, name, symbol, price_updated_at")
    .eq("user_id", uid).eq("price_source", "nav").eq("archived", false);
  await Promise.all((funds ?? []).map(async (h) => {
    const nav = h.symbol ? await fundNav(h.symbol) : null;
    if (!nav) { failed.push(h.name); return; }
    const current = h.price_updated_at ? String(h.price_updated_at).slice(0, 10) : "";
    if (nav.date <= current) return;
    await admin.from("holdings").update({ price: nav.price, currency: "SAR", price_updated_at: `${nav.date}T12:00:00+03:00` }).eq("id", h.id);
    updated++;
  }));
  // watchlist quotes
  const { data: watch } = await admin.from("watchlist").select("id, symbol").eq("user_id", uid);
  await Promise.all((watch ?? []).map(async (w) => {
    if (!w.symbol) return;
    const q = await yahooQuote(w.symbol);
    if (!q) { failed.push(w.symbol); return; }
    await admin.from("watchlist").update({ price: q.price, currency: q.currency || "SAR", price_updated_at: now }).eq("id", w.id);
    updated++;
  }));
  return { updated, failed };
}

// ---------- push notifications ----------
const APP_URL = "https://khalidaseri.github.io/Investment-tracker/";

async function ensureVapid(admin: SupabaseClient): Promise<{ public_key: string; private_key: string }> {
  const read = async () => {
    const { data } = await admin.rpc("get_vapid");
    const row = Array.isArray(data) ? data[0] : data;
    return row?.public_key && row?.private_key ? row : null;
  };
  const found = await read();
  if (found) return found;
  const k = webpush.generateVAPIDKeys();
  await admin.rpc("store_vapid", { p_public: k.publicKey, p_private: k.privateKey });
  return (await read()) ?? { public_key: k.publicKey, private_key: k.privateKey };
}

async function sendPush(admin: SupabaseClient, uid: string, payload: { title: string; body: string; url?: string; tag?: string }) {
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", uid);
  if (!subs?.length) return 0;
  const v = await ensureVapid(admin);
  webpush.setVapidDetails(APP_URL, v.public_key, v.private_key);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ url: APP_URL, ...payload }), { TTL: 86400 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return sent;
}

const yearFrac = (d = new Date()) => {
  const y = d.getUTCFullYear();
  const a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - a) / (b - a);
};
const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");

function nextOccurrence(dateISO: string, recurrence: string, fromISO: string): string | null {
  const d = new Date(dateISO + "T12:00:00Z");
  const from = new Date(fromISO + "T00:00:00Z");
  if (recurrence === "none") return d >= from ? dateISO : null;
  let guard = 0;
  while (d < from && guard++ < 1200) {
    if (recurrence === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return d.toISOString().slice(0, 10);
}

// ---------- schedules (mirror of the app's lib/income.ts) ----------
const DAY = 86400000;
const utcNoon = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00Z");
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const addMonthsUtc = (base: Date, n: number) => {
  const y = base.getUTCFullYear(), m = base.getUTCMonth() + n, day = base.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last), 12));
};
const STEP: Record<string, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
const PER_YEAR: Record<string, number> = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 };
let hijriFmt: Intl.DateTimeFormat | null = null;
let hijriLong: Intl.DateTimeFormat | null = null;
try {
  hijriFmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
  hijriLong = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
} catch (_) { /* fall back to 354-day years */ }
const hijri = (d: Date) => {
  if (!hijriFmt) return null;
  const p = Object.fromEntries(hijriFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: parseInt(String(p.year), 10), m: parseInt(String(p.month), 10), d: parseInt(String(p.day), 10) };
};
function nextHaul(startISO: string, fromISO: string): string | null {
  const start = utcNoon(startISO), from = utcNoon(fromISO);
  const hs = hijri(start);
  let n = Math.max(1, Math.floor((from.getTime() - start.getTime()) / (354.367 * DAY)));
  for (let g = 0; g < 4; g++, n++) {
    const approx = start.getTime() + n * 354.367 * DAY;
    let hit: Date | null = null;
    if (hs) {
      for (let k = -4; k <= 4 && !hit; k++) {
        const c = new Date(approx + k * DAY);
        const h = hijri(c);
        if (h && h.y === hs.y + n && h.m === hs.m && h.d === Math.min(hs.d, 29)) hit = c;
      }
    }
    if (!hit) hit = new Date(approx);
    if (hit >= from) return isoOf(hit);
  }
  return null;
}
function nextPayout(h: Record<string, any>, fromISO: string): string | null {
  if (!h.payout_next || !STEP[h.payout_freq]) return null;
  const base = utcNoon(h.payout_next), from = utcNoon(fromISO);
  const mat = h.maturity_date ? utcNoon(h.maturity_date) : null;
  for (let n = 0; n < 1200; n++) {
    const d = addMonthsUtc(base, n * STEP[h.payout_freq]);
    if (mat && d > mat) return null;
    if (d >= from) return isoOf(d);
  }
  return null;
}
function payoutAmount(h: Record<string, any>, fx: Fx): number | null {
  const per = PER_YEAR[h.payout_freq];
  const q = Number(h.quantity) || 0;
  const r = fx[String(h.currency ?? "SAR").toUpperCase()] ?? 1;
  if (!per || q <= 0) return null;
  if (h.payout_basis === "per_unit") return h.payout_per_unit == null ? null : q * Number(h.payout_per_unit) * r;
  if (h.payout_rate == null) return null;
  const unit = h.payout_nominal ? Number(h.payout_nominal) : Number(h.price) || 0;
  return (q * unit * r * Number(h.payout_rate) / 100) / per;
}
function nextStreamDate(st: Record<string, any>, fromISO: string): string | null {
  if (st.next_date && st.next_date >= fromISO) return st.next_date;
  if (st.frequency !== "yearly" || (!st.month && !st.next_date)) return null;
  const from = utcNoon(fromISO);
  const m = st.month ?? Number(String(st.next_date).slice(5, 7));
  const day = st.next_date ? Number(String(st.next_date).slice(8, 10)) : 1;
  let d = new Date(Date.UTC(from.getUTCFullYear(), m - 1, day, 12));
  if (d < from) d = new Date(Date.UTC(from.getUTCFullYear() + 1, m - 1, day, 12));
  return isoOf(d);
}
const daysUntil = (from: string, to: string) => Math.round((utcNoon(to).getTime() - utcNoon(from).getTime()) / DAY);
const whenText = (days: number) => (days <= 0 ? "اليوم" : days === 1 ? "غداً" : `بعد ${days} أيام`);

async function notifyUser(admin: SupabaseClient, uid: string, morning: boolean, fx: Fx) {
  const { count } = await admin.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", uid);
  if (!count) return { sent: 0 };
  const today = riyadhDate();
  const alerts: Array<{ key: string; title: string; body: string; tag: string; url?: string }> = [];

  if (morning) {
    const { data: events } = await admin.from("events").select("*").eq("user_id", uid).eq("done", false);
    for (const e of events ?? []) {
      const next = nextOccurrence(e.event_date, e.recurrence, today);
      if (!next) continue;
      const days = Math.round((Date.parse(next + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000);
      if (days < 0 || days > 3) continue;
      const when = days === 0 ? "اليوم" : days === 1 ? "غداً" : `بعد ${days} أيام`;
      alerts.push({ key: `ev:${e.id}:${next}`, tag: "event", title: e.title, body: `${when}${e.amount ? `، ${fmt0(e.amount)} ريال` : ""}${e.note ? `. ${e.note}` : ""}` });
    }

    const [{ data: s }, { data: sleeves }, { data: snap }, { data: conn }, { data: planRow }] = await Promise.all([
      admin.from("plan_settings").select("*").eq("user_id", uid).maybeSingle(),
      admin.from("sleeves").select("id, name, target_now, band_min, band_max").eq("user_id", uid),
      admin.from("snapshots").select("total_sar, by_sleeve").eq("user_id", uid).order("snap_date", { ascending: false }).limit(1).maybeSingle(),
      admin.from("ibkr_connection").select("last_status, last_message").eq("user_id", uid).maybeSingle(),
      admin.from("plans").select("doc").eq("user_id", uid).eq("is_active", true).maybeSingle(),
    ]);
    // the active plan (lib/plan.ts PlanDoc); every field is read defensively
    // deno-lint-ignore no-explicit-any
    const plan: any = planRow?.doc && typeof planRow.doc === "object" ? planRow.doc : null;
    if (s && snap && Number(snap.total_sar) > 0) {
      // out of band: outside the active phase's range when the sleeve has one, otherwise farther than rebalance_band from the target
      const off = (sleeves ?? []).filter((x) => {
        const target = Number(x.target_now);
        const actual = (Number((snap.by_sleeve as Record<string, number>)[x.id] ?? 0) / Number(snap.total_sar)) * 100;
        if (x.band_min != null && x.band_max != null) return actual < Number(x.band_min) - 0.05 || actual > Number(x.band_max) + 0.05;
        return Math.abs(actual - target) > Number(s.rebalance_band);
      });
      if (off.length) {
        const week = `${today.slice(0, 4)}-${Math.floor((Date.parse(today) - Date.UTC(Number(today.slice(0, 4)), 0, 1)) / 604800000)}`;
        alerts.push({ key: `drift:${week}`, tag: "drift", title: "أوزان المحفظة خارج نطاقها",
          body: `${off.length === 1 ? off[0].name : `${off.length} طبقات`} خارج النطاق المسموح في خطتك. افتح «الخطة» لترى كيف تعيد التوازن.` });
      }
    }
    // distributions, maturities and each holding's zakat date
    const { data: hs } = await admin.from("holdings").select("*").eq("user_id", uid).eq("archived", false);
    for (const h of hs ?? []) {
      if (!(Number(h.quantity) > 0)) continue;
      const pay = nextPayout(h, today);
      if (pay && daysUntil(today, pay) <= 1) {
        const amt = payoutAmount(h, fx);
        alerts.push({ key: `pay:${h.id}:${pay}`, tag: `pay-${h.id}`, title: `توزيع ${h.name} ${whenText(daysUntil(today, pay))}`,
          body: `${amt ? `المتوقع نحو ${fmt0(amt)} ريال. ` : ""}سجّل وصوله من صفحة التوزيعات.` });
      }
      if (h.maturity_date && daysUntil(today, h.maturity_date) >= 0 && daysUntil(today, h.maturity_date) <= 7) {
        alerts.push({ key: `mat:${h.id}:${h.maturity_date}`, tag: `mat-${h.id}`, title: `استحقاق ${h.name} ${whenText(daysUntil(today, h.maturity_date))}`,
          body: "يعود رأس المال إلى حسابك؛ قرّر أين تعيد استثماره حسب مخطط الإيداع." });
      }
      if (h.zakatable !== false && h.zakat_start) {
        const due = nextHaul(h.zakat_start, today);
        if (due && daysUntil(today, due) <= 3) {
          const value = Number(h.quantity) * Number(h.price) * (fx[String(h.currency ?? "SAR").toUpperCase()] ?? 1);
          alerts.push({ key: `zk:${h.id}:${due}`, tag: `zk-${h.id}`, title: `زكاة ${h.name} ${whenText(daysUntil(today, due))}`,
            body: `يحول الحول في ${hijriLong ? hijriLong.format(utcNoon(due)) : due}. الزكاة التقديرية ${fmt0((value * 2.5) / 100)} ريال بقيمة اليوم.` });
        }
      }
    }
    // values typed in by hand that are due for an update, by each holding's update_every_days (null = 30 days; Mubasher
    // funds 35, as in the app). Sent once when a holding falls due, then weekly while any stays due (never twice a day).
    const dueList = (hs ?? []).filter((h) => Number(h.quantity) > 0 && (h.price_source === "manual" || h.price_source === "nav")).map((h) => {
      const own = Number(h.update_every_days);
      const every = Number.isFinite(own) && own > 0 ? own : h.price_source === "nav" ? 35 : 30;
      const last = Date.parse(String(h.price_updated_at ?? ""));
      return { h, dueAt: Number.isFinite(last) ? last + every * DAY : 0 };
    }).filter((x) => x.dueAt < Date.now()).sort((a, b) => a.dueAt - b.dueAt);
    if (dueList.length) {
      const newest = riyadhDate(new Date(Math.max(...dueList.map((x) => x.dueAt))));
      const n = dueList.length;
      const names = dueList.slice(0, 3).map((x) => String(x.h.name)).join("، ");
      alerts.push({
        key: `upd:${newest}:${Math.floor(Math.max(0, daysUntil(newest, today)) / 7)}`, tag: "update",
        title: n === 1 ? "حان تحديث قيمة أحد أصولك" : n === 2 ? "حان تحديث قيم أصلين من أصولك" : `حان تحديث قيم ${n} من أصولك`,
        body: `${names}${n > 3 ? " وغيرها" : ""}. افتح «تحديث القيم» وأدخل القيم الجديدة.`, url: `${APP_URL}#/update`,
      });
    }
    // the monthly deposit day (optional reminder)
    if (s && s.deposit_day && Number(today.slice(8, 10)) === Number(s.deposit_day)) {
      alerts.push({ key: `dep:${today.slice(0, 7)}`, tag: "deposit", title: "موعد إيداعك الشهري",
        body: "اكتب مبلغ هذا الشهر في مخطط الإيداع ليقسّمه على الطبقات والأهداف." });
    }
    if (plan) {
      const [y, m, dd] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)), Number(today.slice(8, 10))];
      const dayOf = (yy: number, mm: number, day: number) => {
        const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
        return isoOf(new Date(Date.UTC(yy, mm - 1, Math.min(Math.max(1, day), last), 12)));
      };
      // yearly and one-off contributions due within three days
      for (const c of Array.isArray(plan.contributions) ? plan.contributions : []) {
        if (!c || !(Number(c.amount) > 0) || c.kind === "monthly") continue;
        let due: string | null = null;
        if (c.kind === "yearly" && c.month) { due = dayOf(y, Number(c.month), Number(c.day ?? 1)); if (due < today) due = dayOf(y + 1, Number(c.month), Number(c.day ?? 1)); }
        if (c.kind === "once" && typeof c.date === "string") due = c.date;
        if (!due || (c.until && due > c.until)) continue;
        const days = daysUntil(today, due);
        if (days < 0 || days > 3) continue;
        alerts.push({ key: `pc:${c.key}:${due}`, tag: `pc-${c.key}`, title: `${c.name} ${whenText(days)}`,
          body: `خطتك تستثمر منه ${fmt0(Number(c.amount))} ريال. عند وصوله افتح مخطط الإيداع ليقسّمه لك.` });
      }
      // plan steps due within a day
      for (const st of Array.isArray(plan.steps) ? plan.steps : []) {
        if (!st || !st.due) continue;
        let due = String(st.due);
        let done = !!st.done_at;
        if (st.recurring === "yearly") { due = `${y}${due.slice(4)}`; done = !!st.done_at && Number(String(st.done_at).slice(0, 4)) >= y; }
        if (done) continue;
        const days = daysUntil(today, due);
        if (days < 0 || days > 1) continue;
        alerts.push({ key: `step:${st.key}:${due}`, tag: `step-${st.key}`, title: `خطوة في خطتك ${whenText(days)}`, body: String(st.title ?? "") });
      }
      // the annual review, early in the review month
      const reviewMonth = Number(plan.rules?.review_month ?? 1);
      const reviewed = (Array.isArray(plan.reviews) ? plan.reviews : []).some((r: { year?: number }) => Number(r?.year) === y);
      if (m === reviewMonth && dd <= 7 && !reviewed) {
        alerts.push({ key: `review:${y}`, tag: "review", title: "حان موعد المراجعة السنوية",
          body: "راجع الزكاة والتطهير والأوزان ودخل السنة من «الخطة»." });
      }
      // the monthly income transfer, once income has started
      const inc = plan.income;
      if (inc && typeof inc.start === "string" && inc.start <= today) {
        const tday = Number(inc.transfer_day ?? 27);
        let due = dayOf(y, m, tday);
        if (due < today) due = dayOf(y, m + 1, tday);
        const days = daysUntil(today, due);
        if (days <= 1) {
          const approved = Number(plan.state?.income_year) === Number(due.slice(0, 4)) && Number(plan.state?.income_annual) > 0;
          const monthly = inc.method === "fixed" && Number(inc.fixed_monthly) > 0 ? Number(inc.fixed_monthly) : approved ? Number(plan.state.income_annual) / 12 : 0;
          alerts.push({ key: `tr:${due.slice(0, 7)}`, tag: "transfer", title: `تحويل دخلك الشهري ${whenText(days)}`,
            body: monthly ? `حوّل ${fmt0(monthly)} ريال من خزانة الدخل إلى حسابك، ثم سجّله في التطبيق.` : "اعتمد دخل هذه السنة في المراجعة السنوية لتعرف مبلغ التحويل." });
        }
      }
    }
    if (conn?.last_status === "error") {
      alerts.push({ key: `ibkr:${today}`, tag: "ibkr", title: "تعذّرت مزامنة IBKR", body: conn.last_message ?? "افتح الإعدادات وتحقق من الرمز" });
    }
  }

  const { data: watch } = await admin.from("watchlist").select("*").eq("user_id", uid);
  for (const w of watch ?? []) {
    if (!w.price || !w.fair_value) continue;
    const buy = Number(w.fair_value) * (1 - Number(w.margin_pct) / 100);
    if (Number(w.price) > buy) continue;
    const met = [w.c_size, w.c_shariah, w.c_quality, w.c_thesis].filter(Boolean).length;
    alerts.push({ key: `watch:${w.id}:${today}`, tag: `watch-${w.id}`, title: `${w.name} في منطقة الشراء`,
      body: `السعر ${Number(w.price).toFixed(2)} أقل من سعر الشراء ${buy.toFixed(2)}. الشروط المكتملة ${met + 1} من 5.` });
  }

  if (!alerts.length) return { sent: 0 };
  const { data: logged } = await admin.from("notification_log").select("key").eq("user_id", uid).in("key", alerts.map((a) => a.key));
  const seen = new Set((logged ?? []).map((l) => l.key));
  let sent = 0;
  for (const a of alerts.filter((x) => !seen.has(x.key))) {
    const n = await sendPush(admin, uid, { title: a.title, body: a.body, tag: a.tag, ...(a.url ? { url: a.url } : {}) });
    if (n) { sent++; await admin.from("notification_log").insert({ user_id: uid, key: a.key }); }
  }
  return { sent };
}

async function writeSnapshot(admin: SupabaseClient, uid: string, fx: Fx) {
  const [{ data: holdings }, { data: accounts }] = await Promise.all([
    admin.from("holdings").select("account_id, sleeve_id, goal_id, quantity, price, currency, archived").eq("user_id", uid),
    admin.from("accounts").select("id, exclude_from_portfolio").eq("user_id", uid),
  ]);
  const excluded = new Set((accounts ?? []).filter((a) => a.exclude_from_portfolio).map((a) => a.id));
  const bySleeve: Record<string, number> = {};
  const byAccount: Record<string, number> = {};
  let total = 0;
  for (const h of holdings ?? []) {
    if (h.archived || h.goal_id || (h.account_id && excluded.has(h.account_id))) continue;
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
  let body: { mode?: string; q?: string; symbol?: string; symbols?: unknown; funds?: unknown } = {};
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
    const uid = data.user.id;
    if (mode === "vapid") {
      const v = await ensureVapid(admin);
      return json({ ok: true, publicKey: v.public_key });
    }
    if (mode === "search") {
      const q = String(body.q ?? "").trim().slice(0, 60);
      return json({ ok: true, results: q ? await yahooSearch(q) : [] });
    }
    if (mode === "quote") {
      const sym = String(body.symbol ?? "").trim().toUpperCase().slice(0, 30);
      const quote = sym ? await yahooQuote(sym) : null;
      return json({ ok: !!quote, quote });
    }
    if (mode === "push-test") {
      const sent = await sendPush(admin, uid, { title: "مسار", body: "الإشعارات تعمل على هذا الجهاز. ستصلك تنبيهات المواعيد والأوزان وفرص المراقبة هنا.", tag: "test" });
      return json({ ok: sent > 0, sent });
    }
    // market history for the advisor (shared cache; any signed-in user, viewers included)
    if (mode === "series" || mode === "profile") {
      try {
        return json(mode === "series" ? await marketSeries(admin, body) : await marketProfiles(admin, body));
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e), rows: [] }, 500);
      }
    }
    const { count } = await admin.from("plan_settings").select("user_id", { count: "exact", head: true }).eq("user_id", uid);
    if (!count) return json({ ok: true, results: [] });
    userIds = [uid];
  }

  const fx = await refreshFx(admin);
  // the morning job also keeps the US yield curve for the advisor (market_facts)
  let curve: unknown = null;
  if (cronKey && mode === "all") {
    try { curve = await refreshCurve(admin); } catch (e) { curve = { error: e instanceof Error ? e.message : String(e) }; }
  }
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
    if (cronKey) {
      try { res.notify = await notifyUser(admin, uid, mode === "all", fx); } catch (e) { res.notify = { error: String(e) }; }
    }
    results.push(res);
  }
  return json({ ok: true, results, fx, ...(curve ? { curve } : {}) });
});
