// Arabic-aware text matching for search and for recognising a fund from a name the user typed.

const STOP = new Set(['صندوق', 'fund', 'the', 'etf', 'شركه', 'co', 'inc', 'plc'])

/** Lower-case, strip diacritics and tatweel, and fold the letter variants people type interchangeably. */
export function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\p{L}\p{N}.]+/gu, ' ').trim()
}

/** Drops the article and the prepositions written attached to it: «للادخار» and «الادخار» both become «ادخار». */
function bare(t: string): string {
  for (const p of ['وبال', 'ولل', 'وال', 'بال', 'كال', 'فال', 'لل', 'ال']) {
    if (t.startsWith(p) && t.length - p.length >= 3) return t.slice(p.length)
  }
  return t
}

/** The words that carry meaning, in order, without duplicates. */
export function tokens(s: string): string[] {
  const out: string[] = []
  for (const raw of normalize(s).split(' ')) {
    const t = bare(raw)
    if (t && !STOP.has(t) && !out.includes(t)) out.push(t)
  }
  return out
}

/** True when every word of the query appears (as a word start or inside a word) in the text. */
export function matches(query: string, text: string): boolean {
  const q = tokens(query)
  if (q.length === 0) return true
  const hay = tokens(text)
  if (q.every((t) => hay.some((h) => h.includes(t)))) return true
  // «sp500» against «S&P 500»: compare with the spaces taken out
  const joined = q.join('')
  return joined.length >= 3 && normalize(text).replace(/ /g, '').includes(joined)
}

/** 0–1: how much two names share. 1 only when one name's words are all inside the other's. */
export function similarity(a: string, b: string): { contained: boolean; shared: number; jaccard: number } {
  const A = tokens(a), B = tokens(b)
  const shared = A.filter((t) => B.includes(t)).length
  const union = new Set([...A, ...B]).size
  return { contained: shared > 0 && shared === Math.min(A.length, B.length), shared, jaccard: union ? shared / union : 0 }
}
