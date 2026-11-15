export interface TreeRect<T> { item: T; x: number; y: number; w: number; h: number }

/**
 * Squarified treemap layout: packs weighted items into a rectangle keeping tiles as square as it can,
 * so small holdings stay readable. Items must be sorted largest first; weights must be positive.
 */
export function treemap<T>(items: T[], weight: (t: T) => number, width: number, height: number): TreeRect<T>[] {
  const total = items.reduce((s, i) => s + weight(i), 0)
  const out: TreeRect<T>[] = []
  if (!(total > 0) || !(width > 0) || !(height > 0)) return out
  const scale = (width * height) / total
  let x = 0, y = 0, w = width, h = height
  let row: T[] = []
  const area = (t: T) => weight(t) * scale
  const worst = (r: T[], side: number) => {
    const sum = r.reduce((s, t) => s + area(t), 0)
    const max = Math.max(...r.map(area)), min = Math.min(...r.map(area))
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
  }
  const flush = () => {
    const sum = row.reduce((s, t) => s + area(t), 0)
    const horizontal = w >= h          // lay the row along the shorter side
    const thick = sum / (horizontal ? h : w)
    let off = 0
    for (const t of row) {
      const len = area(t) / thick
      out.push(horizontal ? { item: t, x, y: y + off, w: thick, h: len } : { item: t, x: x + off, y, w: len, h: thick })
      off += len
    }
    if (horizontal) { x += thick; w -= thick } else { y += thick; h -= thick }
    row = []
  }
  for (const item of items) {
    if (!(weight(item) > 0)) continue
    const side = Math.min(w, h)
    if (row.length === 0 || worst([...row, item], side) <= worst(row, side)) row.push(item)
    else { flush(); row.push(item) }
  }
  if (row.length) flush()
  return out
}
