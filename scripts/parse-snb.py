# usage: python3 -I scripts/parse-snb.py <prices.xlsx>
# Prints the VALUES rows for the SNB Capital daily price update: ('<name as printed>', nav, previous nav, 'YYYY-MM-DD').
# The sheet is the one https://snbcapital.com/daily-funds loads (saved by scripts/snb-prices.mjs).
import sys, zipfile, re, datetime
import xml.etree.ElementTree as ET
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
z = zipfile.ZipFile(sys.argv[1])
shared = [''.join(t.text or '' for t in si.iter(NS + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(NS + 'si')] if 'xl/sharedStrings.xml' in z.namelist() else []
sheet = sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n))[0]
out = []
for row in ET.fromstring(z.read(sheet)).iter(NS + 'row'):
    c = {}
    for cell in row.findall(NS + 'c'):
        v = cell.find(NS + 'v')
        if v is not None and v.text is not None:
            c[re.match(r'[A-Z]+', cell.get('r')).group(0)] = shared[int(v.text)] if cell.get('t') == 's' else v.text
    try:
        nav = float(c['C']); serial = float(c['E']); change = float(c.get('F', '0'))
    except (KeyError, ValueError):
        continue  # header or an incomplete row
    name = re.sub(r'\s+', ' ', c.get('A', '')).strip()   # the sheet sometimes doubles a space
    if not name or not (0 < nav < 1e6) or not re.fullmatch(r"[A-Za-z0-9 &.\-()']+", name):
        continue
    day = (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(serial))).isoformat()
    prev = nav / (1 + change / 100) if abs(change) < 50 else nav
    out.append("('%s', %s, %s, '%s')" % (name.replace("'", "''"), round(nav, 5), round(prev, 5), day))
print(',\n'.join(out))
print('-- rows: %d' % len(out), file=sys.stderr)
