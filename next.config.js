/** @type {import('next').NextConfig} */

// Two builds from one codebase: the website lives under /Investment-tracker on GitHub Pages,
// the Android app (BUILD_TARGET=native) is served from the WebView root.
const basePath = process.env.BUILD_TARGET === 'native' ? '' : '/Investment-tracker'

const nextConfig = {
  output: 'export',
  basePath,
  images: { unoptimized: true },
  trailingSlash: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

module.exports = nextConfig
