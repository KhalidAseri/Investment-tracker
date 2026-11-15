# Daily price update: how Claude prices assets no provider carries

The app's price service (`supabase/functions/invest-quotes`) answers every symbol a market-data
provider carries: Tadawul shares, funds listed on Tadawul (ETFs 94xx, REITs 43xx, closed-end 47xx),
US and London listings, gold, crypto. Saudi **mutual funds** (open-ended, not listed) have no market
symbol. The app gives them an `MF:` key, and Claude records their published unit price (NAV) every
trading-day evening. This file is the fixed procedure for that run.

Schedule: Sunday–Thursday evening, Riyadh time.

## Store

Supabase project `mahfazati` (`ivicgwjratcfcbmyrnld`). Only these tables belong to this app; never
touch any other table in the project.

| Table | Use in this run |
|---|---|
| `invest_portfolios` | read: which assets the user holds (`data->'assets'`) |
| `invest_quotes` | write: latest unit price per `MF:` symbol |
| `invest_price_history` | write: one row per symbol per valuation day |
| `invest_profile_runs` | write: one log row per run (`kind = 'on_demand'`, summary starts with "أسعار:") |

## Procedure

1. **What needs a price.**
   ```sql
   select distinct a->>'symbol' as symbol, a->>'name' as name
   from invest_portfolios p, jsonb_array_elements(p.data->'assets') a
   where a->>'pricing' = 'live' and a->>'symbol' like 'MF:%';
   ```
   Also check provider coverage: any other `live` symbol whose `invest_quotes.fetched_at` is more than
   3 days old, or that has no row, did not get a provider price — report it (do not invent a price).
   If no portfolio row exists, stop: nothing has been synced yet.
2. **Find the published valuation** for each `MF:` fund, from the manager's own publication first:
   - **Al Rajhi Capital**: daily PDF "ARC Funds NAV report", e.g.
     `https://www.alrajhi-capital.sa/-/media/Feature/AlRajhiCapital/Daily-NAV-Report/2026/mar/ARC-Funds-NAV-report--Mar-26-2026.pdf`.
     The folder and file name change daily and are not predictable; find the latest one by web search
     ("ARC Funds NAV report" + month) or from links on alrajhi-capital.sa. Plain requests from the
     sandbox are refused by the site's firewall; fetch through the web-fetch agent, then extract the
     saved PDF with `pdftotext -layout`. The table gives, per fund: current price date, current price,
     previous price.
   - **Other managers** (SNB Capital, Riyad Capital, Alinma Investment, Albilad Capital, others):
     the fund's page on the manager's site, its latest factsheet, or the fund's profile on
     saudiexchange.sa (Saudi Exchange refuses automated fetches from the sandbox; use it only if the
     web reader can open it).
   - `MF:X-…` keys are funds the user typed by name: identify the fund from the asset name, then
     use the source above.
   - Never invent or estimate a NAV. If no published price is found, leave the previous one and
     report the fund.
3. **Write** for each fund found (prices in the fund's currency):
   ```sql
   insert into invest_quotes (symbol, price, prev_close, currency, name, as_of, source, source_url, fetched_at)
   values ('<MF:…>', <nav>, <previous nav or null>, '<SAR|USD>', '<fund name>', '<valuation date>', 'claude', '<source url>', now())
   on conflict (symbol) do update set price = excluded.price, prev_close = excluded.prev_close,
     currency = excluded.currency, name = excluded.name, as_of = excluded.as_of, source = 'claude',
     source_url = excluded.source_url, fetched_at = now()
   where invest_quotes.as_of <= excluded.as_of;

   insert into invest_price_history (symbol, day, close, source)
   values ('<MF:…>', '<valuation date>', <nav>, 'claude')
   on conflict (symbol, day) do update set close = excluded.close, source = 'claude';
   ```
   When a report also gives the previous price with its date, write that day too. The `as_of` guard
   keeps an older report from overwriting a newer price.
4. **Backfill** once per fund: if a fund has fewer than ~20 history rows, add month-end or year-end
   NAVs from its factsheets so the performance chart has a shape.
5. **Log and report** (Arabic): how many funds were priced and their valuation dates, which funds
   had no published price, and any provider symbol that went stale.

## Al Rajhi report names → app keys

| Report name | Key |
|---|---|
| Al Rajhi Saving and Liquidity Fund - SAR | `MF:RAJHI-SAR-LIQ` |
| Al Rajhi Saving and Liquidity Fund - USD | `MF:RAJHI-USD-LIQ` |
| Al Rajhi Saudi Equity Fund | `MF:RAJHI-SA-EQ` |
| Al Rajhi Global Equity Fund | `MF:RAJHI-GLOBAL` |
| Al Rajhi GCC Equity Fund | `MF:RAJHI-GCC` |
| Al Rajhi Materials Sector Equity Fund | `MF:RAJHI-MATERIALS` |
| Al Rajhi Arab Equity Markets Fund | `MF:RAJHI-ARAB` |
| Al Rajhi Growth and Dividends Fund | `MF:RAJHI-GROW-DIV` |
| Al Rajhi MSCI Index Fund (multi-factor) | `MF:RAJHI-MSCI-MF` |
| Al Rajhi Freestyle Saudi Equity Fund | `MF:RAJHI-FREESTYLE` |
| Al Rajhi Inclusion Fund | `MF:RAJHI-INDEX-INCL` |
| Al Rajhi Mid/Small-Cap Fund | `MF:RAJHI-SMID` |
| Al Rajhi Momentum Fund | `MF:RAJHI-ACTIVE` |
| Al Rajhi Large-Cap Fund | `MF:RAJHI-LEAD` |
| Al Rajhi PetroChemical Fund | `MF:RAJHI-PETRO` |
| Al Rajhi Balanced Fund | `MF:RAJHI-BALANCED` |
| Al Rajhi Growth Fund | `MF:RAJHI-GROWTH` |
| Al Rajhi Conservative Fund | `MF:RAJHI-CONSERV` |
| Al Rajhi Awaeed Fund | `MF:RAJHI-RETURNS` |
| Al Rajhi Monthly Distribution Fund / 2 / 3 | `MF:RAJHI-MONTHLY`, `-2`, `-3` |
| Al Rajhi Real Estate Monthly Distributions Fund | `MF:RAJHI-RE-MONTHLY` |
| Al Rajhi Sukuk Fund | `MF:RAJHI-SUKUK` |

The full list of keys and names for every manager is in `src/lib/catalog.ts` (entries made with `mf(…)`).

## Limits

- A fund's NAV is published after the valuation day, so the price is "last published valuation",
  not live. The app shows its date.
- Each run uses the account owner's usage; the run lives in the owner's Claude session and stops if
  that session is deleted or loses its Supabase connection.
- Assets with no published price (employer savings plans, property, deposits) stay manual.
