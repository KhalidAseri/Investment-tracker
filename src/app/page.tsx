'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Entry redirect. The Android build opens straight on the gold calculator —
 * that is what the app is for on a phone, standing in a shop. The web build
 * keeps landing on the portfolio dashboard.
 */
const HOME = process.env.NEXT_PUBLIC_BUILD_TARGET === 'native' ? '/gold' : '/dashboard'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    router.replace(HOME)
  }, [router])
  return null
}
