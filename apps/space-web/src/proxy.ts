/**
 * Sends a visitor who arrives without a language to Spanish, whatever their
 * browser prefers: `/` becomes `/es` and `/privacy` becomes `/es/privacy`.
 * Paths that already carry a locale, and every static asset, pass untouched.
 */

import { NextResponse, type NextRequest } from 'next/server'

import { DEFAULT_LOCALE, localeFromPath } from '@/lib/locale'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (localeFromPath(pathname)) return NextResponse.next()

  const target = request.nextUrl.clone()
  target.pathname = `/${DEFAULT_LOCALE}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(target)
}

export const config = {
  matcher: [
    '/((?!_next|images|brand|partners|favicon\\.ico|robots\\.txt|sitemap\\.xml|opengraph-image).*)',
  ],
}
