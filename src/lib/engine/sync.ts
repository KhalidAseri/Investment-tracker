export interface SyncFacts {
  /** The device holds something worth keeping. */
  localHasContent: boolean
  /** Local data changed since the last successful sync. */
  localChanged: boolean
  remoteExists: boolean
  /** The remote copy changed since the last successful sync (another device, or a restore). */
  remoteChanged: boolean
}

export type SyncAction = 'none' | 'push' | 'pull' | 'conflict'

/** Decides what a sync should do. A conflict is never resolved silently: the user picks which copy to keep. */
export function syncDecision(f: SyncFacts): SyncAction {
  if (!f.remoteExists) return f.localHasContent ? 'push' : 'none'
  if (!f.localHasContent) return 'pull'
  if (f.localChanged && f.remoteChanged) return 'conflict'
  if (f.remoteChanged) return 'pull'
  if (f.localChanged) return 'push'
  return 'none'
}
