/**
 * Sends a visitor who arrives at `/` to the landing in the language their
 * browser prefers: `/es` or `/en`. The query travels with them, so the API's
 * `/?logout=partial` still reaches the notice it is meant for.
 *
 * Nothing else is matched. The workspace routes are Spanish and unprefixed, and
 * a proxy on every request would only add a hop to each of them.
 */

import { NextResponse, type NextRequest } from 'next/server'

import { preferredLocale } from '@/lib/locale'

export function proxy(request: NextRequest) {
  const target = request.nextUrl.clone()
  target.pathname = `/${preferredLocale(request.headers.get('accept-language'))}`
  return NextResponse.redirect(target)
}

export const config = {
  matcher: '/',
}
