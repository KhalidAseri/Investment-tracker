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
const basePath = isNative ? '' : '/Investment-tracker'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  ...(basePath ? { basePath } : {}),
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    // Next does not rewrite basePath into `metadata.manifest` or `metadata.icons`,
    // so the layout prefixes those URLs itself and needs the value at runtime.
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
}

module.exports = nextConfig
