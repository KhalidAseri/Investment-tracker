'use client'

import { motion } from 'framer-motion'

/**
 * The title block each screen opens with.
 *
 * It animates on mount, which — because the nav now lives in the layout and
 * survives navigation — is what gives a tab switch its sense of arrival: the
 * pill slides, and the new screen's title comes in under it.
 */
export default function PageHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <motion.div
      initial={{ y: -8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <h1 className="text-xl font-extrabold text-gray-900">{title}</h1>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">{subtitle}</p>
    </motion.div>
  )
}
