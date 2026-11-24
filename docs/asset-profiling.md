# Asset profiling: how Claude records each asset's breakdown

The app syncs the user's portfolio to Supabase. Claude reads the assets there, researches what each
one actually holds, and writes a look-through profile the app uses for its analysis (countries,
sectors, asset classes). This file is the fixed procedure for every run: the first analysis,
on-demand requests ("analyse my new assets") and the quarterly refresh.

## Where things are

Supabase project `rasd` (id `vbiqjfgaymwbumhufysw`; moved from `mahfazati` on 2026-11-24). Only the `invest_` tables belong to this
app; every other table belongs to a different app and must not be touched.

| Table | Purpose |
|---|---|
| `invest_portfolios` | one row per user; `data` is the whole portfolio document. Assets are in `data->'assets'` |
| `invest_symbol_profiles` | one row per **symbol**: the profile of a priced fund or share. Public reference data, no user data. This is where profiles of anything with a symbol go |
| `invest_asset_profiles` | one row per (user, asset): only for assets **without** a symbol (employer plans, private funds), and for the user's own hand edits |
| `invest_profile_runs` | one row per run: what was done and what changed |

## Procedure

1. **Read the assets.**
   ```sql
   select p.user_id, a->>'id' as asset_id, a->>'name' as name, a->>'symbol' as symbol,
          a->>'assetClass' as asset_class, a->>'region' as region, a->>'isFund' as is_fund, a->>'pricing' as pricing
   from invest_portfolios p, jsonb_array_elements(p.data->'assets') a;
   ```
   and the existing profiles: `select asset_id, source, locked, as_of from invest_asset_profiles;`
2. **Decide what to do per asset.**
   - `locked = true` (the user edited it): never overwrite. If research disagrees materially, say so in the run summary.
   - No profile, or a refresh run: research it.
   - Assets that no longer exist in the portfolio: delete their profile rows.
3. **Research** from primary sources, in this order: the issuer's fund factsheet or product page;
   the index provider's factsheet for the benchmark; the company's exchange profile for a single stock.
   Record the date the figures refer to.
   - Single stock: country = country of the business/listing, one sector, `classSplit` = `{"EQUITY":100}`.
   - Fund with a published breakdown: use it (`confidence: "reported"`).
   - Fund without one (employer savings plans, private funds): use the benchmark it says it tracks
     and mark `confidence: "estimated"`, naming the benchmark in `note`.
   - Cash, deposits, money-market funds: `classSplit` = `{"CASH":100}`, country of the bank or fund.
   - Gold and crypto: class only, no countries or sectors.
   - Every axis is filled as far as the sources allow: **countries** (ISO codes, never regions),
     **sectors**, the **class split**, and the **top holdings**. A profile with only a class split
     is not finished unless the asset really has no countries or sectors (gold, crypto).
   - Cash, money-market and sukuk funds: `sectors` = `{"NA":100}`, so the sector view counts them as
     analysed rather than as waiting.
   - **A fund of funds: look inside every fund it holds, for countries and for sectors alike.**
     Do not stop at the underlying funds' names, and do not substitute a benchmark's breakdown
     when the underlying holdings can be read.
     1. From the fund's latest factsheet take each underlying fund and its weight (e.g. the SNB
        Capital Global Equity Fund lists ten iShares ETFs). Write them as `{"TICKER": weight}`.
     2. Get each underlying fund's full holdings. iShares US funds:
        `node scripts/ishares-holdings.mjs <dir> IXN ACWI …` saves one CSV per fund (every stock
        with its sector, country and weight). Other issuers: the fund's holdings file or factsheet
        from its own site.
     3. `python3 -I scripts/lookthrough.py <weights.json> <dir>` weights every stock's country and
        sector by its share of its fund and that fund's weight, and prints the fund's countries
        (ISO codes), sectors (the app's keys) and largest underlying stocks, each as a percent of
        the whole fund, plus `covered`: the share of the fund the listed underlying funds add up to.
     4. Write those as `countries`, `sectors` and `topHoldings`. What is not covered (underlying
        funds the factsheet does not name, cash) goes under `OTHER`; countries the app's map does
        not carry (the script lists any it cannot map) are folded into `OTHER` too.
     5. `confidence: "reported"`; `note` says it is a look-through, the share covered, and the two
        dates (the fund's weights, the underlying holdings).
     Only if an underlying fund's holdings cannot be read at all: use that fund's own published
     country and sector breakdown, and failing that its index's; say which in `note` and set
     `confidence: "estimated"`.
   - A factsheet that prints the split only as a chart: render the page (`pdftoppm -r 110 -png`) and
     read the figures from the image; `pdftotext` returns the tables but not the chart labels.
   - Holdings named only in a top-10 list: countries are counted from those and the rest goes under
     `OTHER`. Do not spread the unknown part by guesswork.
   - Sources that work from here: SNB Capital fund pages (`https://snbcapital.com/w/<slug>`, the
     documents they link open in a headless browser); MSCI index factsheets and breakdowns
     (msci.com/documents/…, through the web-fetch agent, then `pdftotext`); Al Rajhi Capital
     factsheets through the web-fetch agent; iShares holdings through `scripts/ishares-holdings.mjs`.
   - Never invent figures. If nothing reliable is found, write no profile and list the asset in the run summary.
4. **Write** (upsert), then one row in `invest_profile_runs`.
   - Asset priced by a symbol (`pricing = 'live'`, including `MF:` funds): write to
     `invest_symbol_profiles` keyed by the symbol. The app applies it to every asset holding that
     symbol, signed in or not, and it survives the asset being deleted and re-added.
     ```sql
     insert into invest_symbol_profiles (symbol, name, profile, as_of, updated_at)
     values ('<symbol>', '<name>', '<profile json>'::jsonb, '<YYYY-MM-DD>', now())
     on conflict (symbol) do update set name = excluded.name, profile = excluded.profile, as_of = excluded.as_of, updated_at = now();
     ```
   - Asset valued by hand: write to `invest_asset_profiles` as before. If its name is a fund in
     the catalogue, write the fund's symbol profile instead and tell the user to link the asset.
   - A row in `invest_asset_profiles` with `locked = true` always wins over the symbol profile.
5. **Report** to the user: how many analysed, which are estimated, which could not be found, and
   any locked asset whose manual figures look out of date.

## Profile format (`profile` column, JSON)

```json
{
  "confidence": "reported",
  "classSplit": { "EQUITY": 99.5, "CASH": 0.5 },
  "countries":  { "US": 62.1, "JP": 5.2, "GB": 3.4, "OTHER": 29.3 },
  "sectors":    { "TECH": 26.0, "FINANCIALS": 17.1, "HEALTH": 10.2 },
  "industries": { "Semiconductors": 9.1 },
  "topHoldings": [{ "name": "NVIDIA", "weight": 4.9 }],
  "benchmark": "FTSE All-World",
  "domicile": "IE",
  "note": "optional, short, in Arabic",
  "sources": [{ "title": "Vanguard VWRA factsheet", "url": "https://..." }]
}
```

- All weight maps are percentages. They should sum to about 100; the app normalises them.
- `classSplit` keys: `EQUITY`, `FIXED_INCOME`, `CASH`, `GOLD`, `REAL_ESTATE`, `CRYPTO`, `OTHER`.
- `countries` keys: ISO 3166-1 alpha-2 codes, plus `OTHER` for the unlisted remainder. List at least
  the countries above 1%; put the rest in `OTHER`.
- `sectors` keys (anything else is shown as "other"): `ENERGY`, `MATERIALS`, `INDUSTRIALS`, `CONSUMER`
  (discretionary and retail), `FOOD` (staples), `HEALTH`, `FINANCIALS`, `BANKS`, `INSURANCE`, `TECH`,
  `TELECOM` (communication services), `UTILITIES`, `REAL_ESTATE`, `OTHER`.
- `industries` and `topHoldings` are free text and optional; keep `topHoldings` to ten.
- `sources`: every figure must be traceable to at least one link.

## Writing

```sql
insert into invest_asset_profiles (user_id, asset_id, name, symbol, profile, source, locked, as_of, updated_at)
values ('<user_id>', '<asset_id>', '<name>', '<symbol or null>', '<json>'::jsonb, 'claude', false, '<YYYY-MM-DD>', now())
on conflict (user_id, asset_id) do update
  set profile = excluded.profile, name = excluded.name, symbol = excluded.symbol,
      as_of = excluded.as_of, updated_at = now(), source = 'claude'
  where invest_asset_profiles.locked = false;

insert into invest_profile_runs (user_id, kind, summary, changes)
values ('<user_id>', 'quarterly', '<one or two Arabic sentences>', '<json array of {asset, change}>'::jsonb);
```

`kind` is `initial`, `quarterly` or `on_demand`. The `where locked = false` guard is the last line of
defence for manual edits; do not remove it.

## Limits to state honestly

- Claude reaches the store only during a session the user starts or the scheduled quarterly run.
- Factsheet data is dated; holdings move between refreshes.
- Estimated profiles describe the benchmark, not the fund's actual holdings.
