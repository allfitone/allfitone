/**
 * The frame of the pages the waitlist emails open: the header without the landing's
 * sections, one panel, the footer. What the panel says is `waitlist-links.tsx`.
 */

import type { ReactNode } from 'react'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import type { Dictionary } from '@/content'
import type { Locale } from '@/lib/locale'

export function LinkPage({
  locale,
  copy,
  path,
  children,
}: {
  locale: Locale
  copy: Dictionary
  path: string
  children: ReactNode
}) {
  return (
    <>
      <Header locale={locale} copy={copy.nav} path={path} sections={false} />
      <main id="content" className="link-page">
        <div className="wrap">
          <div className="join-panel link-page__panel">{children}</div>
        </div>
      </main>
      <Footer locale={locale} copy={copy} />
    </>
  )
}
