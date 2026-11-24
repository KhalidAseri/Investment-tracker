# Daily price update: how Claude prices assets no provider carries

The app's price service (`supabase/functions/invest-quotes`) answers every symbol a market-data
provider carries: Tadawul shares, funds listed on Tadawul (ETFs 94xx, REITs 43xx, closed-end 47xx),
US and London listings, gold, crypto. Saudi **mutual funds** (open-ended, not listed) have no market
symbol. The app gives them an `MF:` key, and Claude records their published unit price (NAV) every
trading-day evening. This file is the fixed procedure for that run.

Schedule: Sunday–Thursday evening, Riyadh time.

## Store

Supabase project `rasd` (`vbiqjfgaymwbumhufysw`; moved from `mahfazati` on 2026-11-24). Only these tables belong to this app; never
touch any other table in the project.

| Table | Use in this run |
|---|---|
| `invest_portfolios` | read: which assets the user holds (`data->'assets'`) |
| `invest_quotes` | write: latest unit price per `MF:` symbol |
| `invest_price_history` | write: one row per symbol per valuation day |
| `invest_profile_runs` | write: one log row per run (`kind = 'on_demand'`, summary starts with "أسعار:") |
| `invest_catalog` | read: maps a manager's fund name to the app's key; write: funds added to the app's list |

## Procedure

1. **What needs a price.** Two lists:
   ```sql
   -- funds held by units: must be priced
   select distinct a->>'symbol' as symbol, a->>'name' as name
   from invest_portfolios p, jsonb_array_elements(p.data->'assets') a
   where a->>'pricing' = 'live' and a->>'symbol' like 'MF:%';

   -- assets valued by hand: check each name against the fund list in src/lib/catalog.ts
   select a->>'name' as name, a->>'manualValue' as value, a->>'valueUpdatedAt' as updated
   from invest_portfolios p, jsonb_array_elements(p.data->'assets') a
   where a->>'pricing' = 'manual';
   ```
   A hand-valued asset whose name is a catalogue fund is **not** priced by this run (it has no units):
   report it, and say that the app offers «اربطه بسعره» on that asset. Never edit `invest_portfolios`:
   the app owns it and a write from here would collide with the phone's next sync.
   Also check provider coverage: any other `live` symbol whose `invest_quotes.fetched_at` is more than
   3 days old, or that has no row, did not get a provider price — report it (do not invent a price).
2. **Al Rajhi Capital: price every fund in the report, every run**, whether or not anyone holds it
   (one PDF carries all of them, and the history it builds is what the performance chart shows).
   - URL: `https://alrajhi-capital.sa/-/media/Feature/AlRajhiCapital/Daily-NAV-Report/<YYYY>/<MON>/ARC-Funds-NAV-report--<Mon>-<DD>-<YYYY>.pdf`
     e.g. `…/2026/NOV/ARC-Funds-NAV-report--Nov-17-2026.pdf` (verified 2026-11-20).
   - The report for a valuation day is published the **next working day in the evening**. Start from
     yesterday and walk back one day at a time (skip Friday and Saturday) until a PDF is returned; at
     most 6 tries. A missing report comes back as an HTML «خطأ 404» page with HTTP 200.
   - The month folder's spelling is not stable: seen `NOV`, `AUG`, `JAN`, `JUN`, `OCT` (2026), `Apr`,
     `mar`, and `DEC` with a file named `December-14-2025`. Try upper case first, then `Nov`, then `nov`.
   - Plain requests from the sandbox are refused by the site's firewall. Fetch through the **web-fetch
     agent** (ask it only to fetch and report PDF-or-404, not to read), then parse the saved file:
     `python3 -I scripts/parse-nav.py <copy of the pdf>`,
     or `pdftotext -layout`. Each row gives: current price date, current price, previous price.
     Take the **last** date-and-two-numbers group on a line (the first can be the inception date).
   - Sanity check before writing: the report date matches the file name, and no fund moved more than
     15% against its stored price unless the report itself shows that daily change.
3. **SNB Capital: price every fund on its daily sheet, every run.**
   - `node scripts/snb-prices.mjs <dir>/snb.xlsx` opens https://snbcapital.com/daily-funds in a headless
     browser and saves the price sheet the page loads (an .xlsx whose address changes; it is public
     and the site does not refuse the request). Exit code 1 means no sheet was seen: report it.
   - `python3 -I scripts/parse-snb.py <dir>/snb.xlsx` prints one `('<name as printed>', nav, previous nav, 'YYYY-MM-DD')`
     row per fund, with the full precision of the sheet. Keep the file in its own empty directory.
   - The names map to the app's keys through `invest_catalog.source_name`, so the write is a join:
     ```sql
     with v(name, nav, prev, day) as (values <rows from parse-snb.py>),
     m as (select c.symbol, c.currency, c.ar, v.nav, v.prev, v.day::date as day
           from v join invest_catalog c on c.source_name = v.name and not c.hidden),
     q as (insert into invest_quotes (symbol, price, prev_close, currency, name, as_of, source, source_url, fetched_at)
       select symbol, nav, prev, currency, ar, day, 'claude', 'https://snbcapital.com/daily-funds', now() from m
       on conflict (symbol) do update set price = excluded.price, prev_close = excluded.prev_close, currency = excluded.currency,
         name = excluded.name, as_of = excluded.as_of, source = 'claude', source_url = excluded.source_url, fetched_at = now()
       where invest_quotes.as_of <= excluded.as_of returning 1),
     h as (insert into invest_price_history (symbol, day, close, source) select symbol, day, nav, 'claude' from m
       on conflict (symbol, day) do update set close = excluded.close, source = 'claude' returning 1)
     select (select count(*) from m) as matched, (select count(*) from q), (select count(*) from h);
     ```
   - Each fund has its own valuation day (most daily; global funds Monday and Wednesday; the sukuk
     funds weekly). A sheet row with no match in `invest_catalog` is a fund the app does not list:
     if it is an ordinary public fund, add it to `invest_catalog` (see below) and say so.
4. **Other managers** (Riyad Capital, Alinma Investment, Albilad Capital, others), only
   for funds someone holds: the fund's page on the manager's site or its latest factsheet. Saudi
   Exchange, Argaam and Mubasher did not return data to automated readers when tried (2026-11-20).
   `MF:X-…` keys are funds the user typed by name: identify the fund from the asset name first.
   Never invent or estimate a NAV. If no published price is found, leave the previous one and report it.
5. **Write** (prices in the fund's currency). One statement for all funds of a report:
   ```sql
   with v(symbol, price, prev, cur, name) as (values ('MF:…', <nav>, <previous nav>, 'SAR', '<fund name>'), …),
   q as (insert into invest_quotes (symbol, price, prev_close, currency, name, as_of, source, source_url, fetched_at)
     select symbol, price, prev, cur, name, date '<valuation date>', 'claude', '<report url>', now() from v
     on conflict (symbol) do update set price = excluded.price, prev_close = excluded.prev_close,
       currency = excluded.currency, name = excluded.name, as_of = excluded.as_of, source = 'claude',
       source_url = excluded.source_url, fetched_at = now()
     where invest_quotes.as_of <= excluded.as_of returning 1),
   h as (insert into invest_price_history (symbol, day, close, source)
     select symbol, date '<valuation date>', price, 'claude' from v
     on conflict (symbol, day) do update set close = excluded.close, source = 'claude' returning 1)
   select (select count(*) from q), (select count(*) from h);
   ```
   The `as_of` guard keeps an older report from overwriting a newer price.
6. **Log and report** (Arabic, two lines): how many funds were priced and their valuation date, which
   held funds had no published price, which hand-valued assets should be linked, and any provider
   symbol that went stale. Log one row in `invest_profile_runs`.

## The list of securities lives in the database

`invest_catalog` holds the securities the app offers in its add screen. The app ships a built-in
list (`src/lib/catalog.ts`) so it works offline; rows in `invest_catalog` are added to it and
override it by symbol, and `hidden = true` withdraws a built-in entry. The app reads the table on
opening and keeps a copy on the device. So a fund is added, renamed or withdrawn here, with no app
release:

```sql
insert into invest_catalog (symbol, ar, en, kind, asset_class, region, sector, currency, grp, manager, shariah, aliases, source_name)
values ('MF:<KEY>', '<Arabic name>', '<English name>', 'SA_STOCK', 'EQUITY', 'SA', 'DIVERSIFIED', 'SAR', 'mutual', '<manager, Arabic>', null, '<former names>', '<name on the manager''s price sheet>')
on conflict (symbol) do update set ar = excluded.ar, en = excluded.en, updated_at = now();
```

Only names read from the manager's own site or price sheet go in. `shariah` is set only where the
manager's page says so; `aliases` are former or commonly used names, searched but never shown.

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
| Al Rajhi Sukuk distribution Fund | `MF:RAJHI-SUKUK-DIV` |
| Al Rajhi Saudi Health Care Equity Fund | `MF:RAJHI-HEALTH` |
| Al Rajhi Namaa Fund | `MF:RAJHI-NAMA` |

Not in the app (skip): the endowment funds, and the two Al Rajhi MSCI ETFs (listed: priced by the provider as 9413.SR and 9414.SR).

The full list of keys and names for every manager is in `src/lib/catalog.ts` (entries made with `mf(…)`).

## Limits

- A fund's NAV is published after the valuation day, so the price is "last published valuation",
  not live. The app shows its date.
- Each run uses the account owner's usage; the run lives in the owner's Claude session and stops if
  that session is deleted or loses its Supabase connection.
- Assets with no published price (employer savings plans, property, deposits) stay manual.
