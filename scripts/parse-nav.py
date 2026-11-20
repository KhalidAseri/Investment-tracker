import re, subprocess, sys, json
# usage: parse_nav.py <pdf>  -> JSON {report_date, funds:[{name, date, price, prev}]}
txt = subprocess.run(['pdftotext', '-layout', sys.argv[1], '-'], capture_output=True, text=True).stdout
txt = re.sub('[‪-‮‎‏�]', '', txt)
lines = txt.split('\n')
num = r'([\d,]+\.\d+)'
pat = re.compile(r'([A-Z][a-z]{2} \d{1,2}, \d{4})\s+' + num + r'\s+' + num)
MONTHS = {m: i + 1 for i, m in enumerate('Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split())}
def iso(s):
    m, d, y = re.match(r'([A-Z][a-z]{2}) (\d{1,2}), (\d{4})', s).groups()
    return f'{y}-{MONTHS[m]:02d}-{int(d):02d}'
out = []
for i, line in enumerate(lines):
    ms = list(pat.finditer(line))
    if not ms: continue
    m = ms[-1]
    head = line[:ms[0].start()]
    # name printed on the same line (before the inception date) or on the next latin line(s)
    lead = re.sub(r'\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b.*$', '', head).strip()
    lead = lead if re.search('[A-Za-z]{3}', lead) else ''
    nxt = ''
    for j in range(i + 1, min(i + 3, len(lines))):
        s = lines[j].strip()
        if re.search('[A-Za-z]{3}', s) and not pat.search(s) and not re.fullmatch('[A-Z ]+FUNDS?|Multi Asset Fund|FUND OF FUNDS', s):
            nxt = s; break
    name = (lead + ' ' + nxt).strip() if lead and len(nxt) < 12 else (lead or nxt)
    out.append({'name': re.sub(r'\s+', ' ', name), 'date': iso(m.group(1)), 'price': float(m.group(2).replace(',', '')), 'prev': float(m.group(3).replace(',', ''))})
print(json.dumps({'funds': out}, ensure_ascii=False, indent=1))
