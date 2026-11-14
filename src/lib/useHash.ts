'use client'

import { useCallback, useEffect, useState } from 'react'

/** The URL hash as state, so tabs inside a page are linkable (e.g. /plan/#zakat). */
export function useHash(fallback: string): [string, (next: string) => void] {
  const [hash, setHash] = useState(fallback)
  useEffect(() => {
    const read = () => setHash(window.location.hash.replace(/^#/, '') || fallback)
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [fallback])
  const set = useCallback((next: string) => {
    window.history.replaceState(null, '', `#${next}`)
    setHash(next)
  }, [])
  return [hash, set]
}
