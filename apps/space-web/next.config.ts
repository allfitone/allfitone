import path from 'node:path'

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Only the container build sets this; Vercel keeps its own output.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone', outputFileTracingRoot: path.resolve(process.cwd(), '../..') }
    : {}),
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    // Programme covers fill tall cards; 75 smears their dark gradients.
    qualities: [75, 88],
  },
}

export default nextConfig
