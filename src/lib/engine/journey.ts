// The route the app is built around: emergency fund first, then the goal in quarters.

export type StationId = 'ef' | 'g25' | 'g50' | 'g75' | 'g100'
export interface Station { id: StationId; /** Position along the line, 0–100. */ at: number; reached: boolean }
export interface Journey {
  stations: Station[]
  /** Where the holder is on the line, 0–100. */
  position: number
  next: Station | null
}

interface Ef { target: number; pct: number; ready: boolean }
interface Goal { target: number; pct: number }

/**
 * With an emergency fund to build, it takes the first fifth of the line and the goal the rest;
 * the goal does not advance until the fund is complete, which is the order the plan asks for.
 */
export function journey(ef: Ef, goal: Goal): Journey {
  const hasEf = ef.target > 0
  const efDone = !hasEf || ef.ready
  const start = hasEf ? 20 : 0
  const g = Math.max(0, Math.min(100, goal.target > 0 ? goal.pct : 0))
  const stations: Station[] = [
    ...(hasEf ? [{ id: 'ef' as const, at: start, reached: ef.ready }] : []),
    ...([25, 50, 75, 100] as const).map((q) => ({ id: `g${q}` as StationId, at: start + ((100 - start) * q) / 100, reached: efDone && goal.target > 0 && g >= q })),
  ]
  const position = !efDone ? (start * Math.max(0, Math.min(100, ef.pct))) / 100 : start + ((100 - start) * g) / 100
  return { stations, position, next: stations.find((s) => !s.reached) ?? null }
}

/**
 * Stations to celebrate now. The first time (nothing recorded yet) everything already reached is
 * adopted silently: a milestone is announced when it is crossed, not when the app is updated.
 */
export function newMilestones(reached: string[], seen: string[] | undefined): string[] {
  if (seen === undefined) return []
  return reached.filter((id) => !seen.includes(id))
}
