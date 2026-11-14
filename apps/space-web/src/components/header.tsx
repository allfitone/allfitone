import { ProductLockup } from '@allfitone/react/brand'
import {
  SiteHeader,
  SiteHeaderActions,
  SiteHeaderHome,
  SiteHeaderLink,
  SiteHeaderNav,
  SiteLanguageLink,
  SiteLanguageSwitch,
} from '@allfitone/react/components/site-shell'
import Link from 'next/link'

import type { Dictionary } from '@/content'
import { LOCALES, type Locale } from '@/lib/locale'
import { WAITLIST_PATH } from '@/lib/waitlist'

/**
 * The site header shared with studio.allfit.one, from the Design System. It
 * reads as Space because the document is `data-afo-theme="dark"`; this file
 * only supplies Space's lockup, sections, the waitlist action and the language
 * routes. The waitlist page passes `sections={false}`: it has neither the
 * landing's sections nor a reason to link to itself.
 */
export function Header({
  locale,
  copy,
  path = '',
  sections = true,
}: {
  locale: Locale
  copy: Dictionary['nav']
  path?: string
  sections?: boolean
}) {
  const home = `/${locale}`
  const links = [
    { id: 'app', label: copy.features },
    { id: 'programs', label: copy.programs },
    { id: 'privacy', label: copy.privacy },
    { id: 'gyms', label: copy.gyms },
  ]
  return (
    <SiteHeader>
      <SiteHeaderHome render={<Link href={home} />} aria-label={copy.home}>
        <ProductLockup product="space" surface="dark" aria-hidden="true" />
      </SiteHeaderHome>
      {sections ? (
        <SiteHeaderNav aria-label={copy.label}>
          {links.map((link) => (
            <SiteHeaderLink key={link.id} href={`#${link.id}`}>
              {link.label}
            </SiteHeaderLink>
          ))}
        </SiteHeaderNav>
      ) : null}
      <SiteHeaderActions>
        {sections ? (
          <Link className="header-join" href={`/${locale}${WAITLIST_PATH}`}>
            {copy.join}
          </Link>
        ) : null}
        {/* Keeps the visitor on the same page in the other language. */}
        <SiteLanguageSwitch aria-label={copy.language}>
          {LOCALES.map((option) => (
            <SiteLanguageLink
              key={option}
              render={<Link href={`/${option}${path}`} />}
              hrefLang={option}
              lang={option}
              current={option === locale}
            >
              {option.toUpperCase()}
            </SiteLanguageLink>
          ))}
        </SiteLanguageSwitch>
      </SiteHeaderActions>
    </SiteHeader>
  )
}
