/**
 * Sends a visitor who arrives at `/` to the Spanish landing, whatever their
 * browser prefers. The query travels with them, so the API's
 * `/?logout=partial` still reaches the notice it is meant for.
 *
 * Nothing else is matched. The workspace routes are Spanish and unprefixed, and
 * a proxy on every request would only add a hop to each of them.
 */

import { NextResponse, type NextRequest } from 'next/server'

import { DEFAULT_LOCALE } from '@/lib/locale'

export function proxy(request: NextRequest) {
  const target = request.nextUrl.clone()
  target.pathname = `/${DEFAULT_LOCALE}`
  return NextResponse.redirect(target)
}

export const config = {
  matcher: '/',
}
