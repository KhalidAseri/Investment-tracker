# usage: python3 -I scripts/lookthrough.py <weights.json> <dir with TICKER.csv files>
#
# Looks through a fund of funds. weights.json maps each underlying iShares fund's ticker to its
# weight in the fund, in percent, as the fund's factsheet prints it, e.g. {"IXN": 21.18, "ACWI": 14.95}.
# The CSVs are the underlying funds' full holdings (scripts/ishares-holdings.mjs). Every stock's
# country and sector is weighted by its share of its fund and by that fund's weight, and summed.
# Prints the countries (ISO codes), sectors (the app's keys) and largest underlying stocks, each as
# a percent of the whole fund. What the weights do not cover is left for the caller to put under OTHER.
import csv, io, json, sys, os

ISO = {
 'United States': 'US', 'Japan': 'JP', 'United Kingdom': 'GB', 'Canada': 'CA', 'France': 'FR', 'Germany': 'DE', 'Switzerland': 'CH',
 'Australia': 'AU', 'Netherlands': 'NL', 'Sweden': 'SE', 'Spain': 'ES', 'Italy': 'IT', 'Denmark': 'DK', 'Finland': 'FI', 'Norway': 'NO',
 'Belgium': 'BE', 'Ireland': 'IE', 'Austria': 'AT', 'Portugal': 'PT', 'Israel': 'IL', 'New Zealand': 'NZ', 'Singapore': 'SG',
 'Hong Kong': 'HK', 'China': 'CN', 'Taiwan': 'TW', 'Korea (South)': 'KR', 'India': 'IN', 'Brazil': 'BR', 'Mexico': 'MX', 'Chile': 'CL',
 'Colombia': 'CO', 'Peru': 'PE', 'South Africa': 'ZA', 'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE', 'Qatar': 'QA', 'Kuwait': 'KW',
 'Egypt': 'EG', 'Turkey': 'TR', 'Poland': 'PL', 'Greece': 'GR', 'Hungary': 'HU', 'Czech Republic': 'CZ', 'Indonesia': 'ID',
 'Malaysia': 'MY', 'Thailand': 'TH', 'Philippines': 'PH', 'Luxembourg': 'LU', 'Argentina': 'AR', 'Russian Federation': 'RU',
}
SECTOR = {
 'Information Technology': 'TECH', 'Financials': 'FINANCIALS', 'Health Care': 'HEALTH', 'Consumer Discretionary': 'CONSUMER',
 'Consumer Staples': 'CONSUMER', 'Communication': 'TELECOM', 'Communication Services': 'TELECOM', 'Industrials': 'INDUSTRIALS',
 'Energy': 'ENERGY', 'Utilities': 'UTILITIES', 'Materials': 'MATERIALS', 'Real Estate': 'REAL_ESTATE',
}

def holdings(path):
    text = open(path, encoding='utf-8-sig').read()
    start = text.find('Ticker,Name,Sector')
    if start < 0: raise SystemExit('no holdings table in ' + path)
    rows = []
    for r in csv.DictReader(io.StringIO(text[start:])):
        if (r.get('Asset Class') or '') != 'Equity': continue
        try: w = float((r.get('Weight (%)') or '').replace(',', ''))
        except ValueError: continue
        if w > 0: rows.append((r['Name'].strip(), r['Sector'].strip(), r['Location'].strip(), w))
    return rows

weights = json.load(open(sys.argv[1]))
countries, sectors, stocks, unknown = {}, {}, {}, {}
covered = 0.0
for ticker, fund_weight in weights.items():
    rows = holdings(os.path.join(sys.argv[2], ticker + '.csv'))
    total = sum(r[3] for r in rows)
    covered += fund_weight
    for name, sector, location, w in rows:
        part = fund_weight * w / total
        code = ISO.get(location)
        if code is None:
            unknown[location] = unknown.get(location, 0) + part; code = 'OTHER'
        countries[code] = countries.get(code, 0) + part
        key = SECTOR.get(sector, 'OTHER')
        sectors[key] = sectors.get(key, 0) + part
        stocks[name] = stocks.get(name, 0) + part

def top(d, floor):
    kept = {k: v for k, v in d.items() if v >= floor and k != 'OTHER'}
    rest = sum(v for k, v in d.items() if k not in kept)
    out = dict(sorted(((k, round(v, 2)) for k, v in kept.items()), key=lambda x: -x[1]))
    if rest > 0.005: out['OTHER'] = round(rest, 2)
    return out

print(json.dumps({
  'covered': round(covered, 2),
  'countries': top(countries, 0.15),
  'sectors': top(sectors, 0.0),
  'topStocks': [{'name': k.title(), 'weight': round(v, 2)} for k, v in sorted(stocks.items(), key=lambda x: -x[1])[:10]],
  'unmappedLocations': {k: round(v, 3) for k, v in unknown.items()},
}, ensure_ascii=False, indent=1))
