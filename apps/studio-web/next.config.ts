import path from 'node:path'

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Only the container build sets this; Vercel keeps its own output.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone', outputFileTracingRoot: path.resolve(process.cwd(), '../..') }
    : {}),
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // Two root layouts leave no single one for an unmatched address to render in.
  experimental: { globalNotFound: true },
  async headers() {
    const noStore = [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }]
    return [{ source: '/organizations/:path*', headers: noStore }]
  },
}

export default nextConfig
