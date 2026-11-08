-- «المستشار» (advisor release of مسار), Nov 2026.
--  1. holdings: manual update frequency, catalog link, look-through override, zakat method and ratio.
--  2. Shared market-data cache written only by the daily-update function (service role):
--     market_series (monthly histories), market_facts (yield curve), instrument_profiles (Yahoo facts per symbol).
-- Idempotent: every statement can run again safely.

-- =====================================================================================
-- 1 · holdings
-- =====================================================================================
alter table public.holdings add column if not exists update_every_days integer;
alter table public.holdings add column if not exists catalog_id text;
alter table public.holdings add column if not exists profile jsonb;
alter table public.holdings add column if not exists zakat_method text;
alter table public.holdings add column if not exists zakat_ratio numeric;

comment on column public.holdings.update_every_days is 'manual holdings: remind to update every N days (null = 30); ignored for automatic prices';
comment on column public.holdings.catalog_id is 'instrument id in the app catalog (lib/catalog.data.ts) or the plan''s own instruments';
comment on column public.holdings.profile is 'owner override of the look-through: {class?, countries?, sectors?, industry?, duration_years?}';
comment on column public.holdings.zakat_method is 'market | zakatable_assets | paid_by_entity | income_only | exempt (null = the class default)';
comment on column public.holdings.zakat_ratio is '% of the value that is zakatable when zakat_method = zakatable_assets';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'holdings_update_every_days_check' and conrelid = 'public.holdings'::regclass) then
    alter table public.holdings add constraint holdings_update_every_days_check
      check (update_every_days is null or update_every_days between 1 and 3660);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'holdings_zakat_method_check' and conrelid = 'public.holdings'::regclass) then
    alter table public.holdings add constraint holdings_zakat_method_check
      check (zakat_method is null or zakat_method in ('market', 'zakatable_assets', 'paid_by_entity', 'income_only', 'exempt'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'holdings_zakat_ratio_check' and conrelid = 'public.holdings'::regclass) then
    alter table public.holdings add constraint holdings_zakat_ratio_check
      check (zakat_ratio is null or (zakat_ratio >= 0 and zakat_ratio <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'holdings_profile_check' and conrelid = 'public.holdings'::regclass) then
    alter table public.holdings add constraint holdings_profile_check
      check (profile is null or jsonb_typeof(profile) = 'object');
  end if;
end $$;

-- =====================================================================================
-- 2 · market data cache (not per user: the same history serves everyone)
-- =====================================================================================
create table if not exists public.market_series (
  -- Yahoo symbol in upper case (e.g. 'ACWI', '^TASI.SR', '^IRX') or a Saudi fund id from Mubasher (digits)
  symbol text primary key,
  kind text not null default 'price' check (kind in ('price', 'nav', 'rate')),
  currency text,
  -- one entry per month, oldest first: [["YYYY-MM", close, adjclose, dividends], ...]; 'rate' rows hold the yield in %
  points jsonb not null default '[]'::jsonb check (jsonb_typeof(points) = 'array'),
  -- {name, exchange, type, source, first, last, count, error, failed_at}
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
comment on table public.market_series is 'Monthly price, NAV and yield histories (Yahoo chart range=max interval=1mo; Mubasher NAV reduced to month-end). Written by daily-update only.';

create table if not exists public.market_facts (
  -- us_3m, us_5y, us_10y, us_30y (US Treasury yields, %)
  key text primary key,
  value numeric,
  meta jsonb not null default '{}'::jsonb,
  as_of date,
  updated_at timestamptz not null default now()
);
comment on table public.market_facts is 'Single market numbers refreshed by the morning job (the US yield curve). Written by daily-update only.';

create table if not exists public.instrument_profiles (
  symbol text primary key,
  -- {quote_type, sector, industry, exchange, exchange_name, name, country, error}
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  source text not null default 'yahoo',
  updated_at timestamptz not null default now()
);
comment on table public.instrument_profiles is 'Facts about listed instruments from Yahoo symbol search (quote type, sector, industry, exchange, country). Written by daily-update only.';

-- refresh jobs look for the oldest rows
create index if not exists market_series_updated_at_idx on public.market_series (updated_at);
create index if not exists instrument_profiles_updated_at_idx on public.instrument_profiles (updated_at);

-- =====================================================================================
-- 3 · access: signed-in users read; only the service role (which bypasses RLS) writes
-- =====================================================================================
alter table public.market_series enable row level security;
alter table public.market_facts enable row level security;
alter table public.instrument_profiles enable row level security;

drop policy if exists "market_series read" on public.market_series;
create policy "market_series read" on public.market_series for select to authenticated using (true);
drop policy if exists "market_facts read" on public.market_facts;
create policy "market_facts read" on public.market_facts for select to authenticated using (true);
drop policy if exists "instrument_profiles read" on public.instrument_profiles;
create policy "instrument_profiles read" on public.instrument_profiles for select to authenticated using (true);

-- no insert/update/delete policies; table privileges match (defence in depth)
revoke all on table public.market_series, public.market_facts, public.instrument_profiles from anon, authenticated;
grant select on table public.market_series, public.market_facts, public.instrument_profiles to authenticated;
grant all on table public.market_series, public.market_facts, public.instrument_profiles to service_role;
