import type { Transition, Variants } from 'framer-motion'

/**
 * The app's motion vocabulary, kept in one place so every screen moves the
 * same way.
 *
 * Two rules shape everything here:
 *
 *  1. Motion carries meaning. A number that counts up says "this changed
 *     because of what you just did". A card that slides in says "this is new".
 *     Decorative movement that says nothing is left out.
 *  2. Nothing blocks the answer. The user is standing in a shop with a seller
 *     waiting, so entrances are short (under ~0.4s) and the figure is readable
 *     the whole time it animates, never faded out to nothing.
 *  3. An entrance may move, but it must never hide. This is a static export:
 *     the HTML is painted before the JavaScript that animates it runs, so any
 *     `opacity: 0` starting state is a blank screen on a slow phone and a
 *     permanently blank one if the bundle fails to load. Content present on
 *     first paint therefore animates with transforms alone; fading in is kept
 *     for what appears in response to a tap, which by definition cannot be
 *     on screen before JavaScript is alive.
 */

/** Springs tuned by feel, not by default. */
export const SPRING: Transition = { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }
/** Softer, for larger surfaces where a snappy spring reads as a jolt. */
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 260, damping: 28 }
/** Cards entering a screen: up and in. Readable the whole way (see rule 3). */
export const cardIn: Variants = {
  hidden: { y: 14, scale: 0.985 },
  show: { y: 0, scale: 1, transition: SPRING_SOFT },
  exit: { opacity: 0, y: -8, scale: 0.99, transition: { duration: 0.18 } },
}

/** Parent of a run of cards, so they arrive one after another. */
export const stagger = (delayChildren = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren } },
})

/** Collapsible sections. Height animates from the measured content height. */
export const collapse: Variants = {
  hidden: { height: 0, opacity: 0 },
  show: { height: 'auto', opacity: 1, transition: { height: SPRING_SOFT, opacity: { duration: 0.2, delay: 0.05 } } },
  exit: { height: 0, opacity: 0, transition: { height: { duration: 0.22 }, opacity: { duration: 0.12 } } },
}

/** Standard press feedback for anything tappable. */
export const TAP = { scale: 0.96 }

