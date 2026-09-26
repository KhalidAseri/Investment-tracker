'use client'

import { motion } from 'framer-motion'

/**
 * Slides a block in the first time it is scrolled to.
 *
 * Used on the reference page, which is long by nature: revealing each section
 * as it arrives turns a wall of cards into a sequence, and gives the eye a
 * place to land. It fires once — re-animating on every scroll past would be
 * noise, not guidance.
 */
export default function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ y: 16 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
