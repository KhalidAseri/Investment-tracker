/**
 * The same source builds two targets:
 *
 *  - web    (default) — static export served from GitHub Pages under a
 *                       repository sub-path, so it needs `basePath`.
 *  - native (BUILD_TARGET=native) — the same export bundled inside the Android
 *                       app, where Capacitor serves it from the server root.
 *                       A `basePath` there would break every asset URL.
 */
const isNative = process.env.BUILD_TARGET === 'native'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  ...(isNative ? {} : { basePath: '/Investment-tracker' }),
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    // Lets the app know which shell it is running in at runtime.
    NEXT_PUBLIC_BUILD_TARGET: isNative ? 'native' : 'web',
  },
}

module.exports = nextConfig
