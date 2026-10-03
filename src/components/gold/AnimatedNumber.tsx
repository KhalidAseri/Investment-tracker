'use client'

import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * A number that travels to its new value instead of jumping to it.
 *
 * The point is not decoration: when the user nudges the weight from 10g to 11g,
 * watching every figure on screen slide in the same direction makes the link
 * between the input and the price obvious in a way an instant swap never does.
 *
 * What is held in state is the number mid-flight, not the formatted string, so
 * switching currency reformats the figure immediately even when its value is
 * unchanged.
 */
export default function AnimatedNumber({
  value,
  format,
  className,
  countOnMount = false,
  duration = 0.55,
}: {
  value: number
  /** Turns the in-flight number into display text (currency, percent, …). */
  format: (value: number) => string
  className?: string
  /** Count up from zero on first paint. Reserve it for the one hero figure. */
  countOnMount?: boolean
  duration?: number
}) {
  const reduced = useReducedMotion()
  const safe = Number.isFinite(value) ? value : 0

  const [shown, setShown] = useState(() => (countOnMount ? 0 : safe))
  // Where the number actually is right now. Retargeting mid-flight has to
  // continue from here, not from the previous target, or the figure jumps.
  const current = useRef(countOnMount ? 0 : safe)

  useEffect(() => {
    if (reduced) {
      current.current = safe
      setShown(safe)
      return
    }
    if (current.current === safe) return

    const controls = animate(current.current, safe, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        current.current = latest
        setShown(latest)
      },
      onComplete: () => {
        current.current = safe
        setShown(safe)
      },
    })

    // The animation is driven by animation frames, which a browser is free to
    // withhold from a page it considers hidden or busy. A price stuck part-way
    // — worse, a hero figure stranded at zero — would read as a broken app, so
    // a timer lands the true value regardless of whether frames ever arrived.
    const settle = setTimeout(() => {
      controls.stop()
      current.current = safe
      setShown(safe)
    }, duration * 1000 + 400)

    return () => {
      controls.stop()
      clearTimeout(settle)
    }
  }, [safe, reduced, duration])

  return <span className={cn('tabular-nums', className)}>{format(shown)}</span>
}
