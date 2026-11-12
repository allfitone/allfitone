import path from 'node:path'

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Only the container build sets this; local builds keep the default output.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone', outputFileTracingRoot: path.resolve(process.cwd(), '../..') }
    : {}),
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // The legal documents moved to www.allfit.one in November 2026, one set for every
  // product. Redirects run before `proxy.ts`, so the unprefixed paths go straight there.
  async redirects() {
    return [
      ...['terms', 'privacy'].flatMap((document) => [
        {
          source: `/:locale(es|en)/${document}`,
          destination: `https://www.allfit.one/:locale/legal/${document}`,
          permanent: true,
        },
        {
          source: `/${document}`,
          destination: `https://www.allfit.one/es/legal/${document}`,
          permanent: true,
        },
      ]),
    ]
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Programme covers and the Pro photo have dark gradients that 75 smears.
    qualities: [75, 88],
  },
}

export default nextConfig
