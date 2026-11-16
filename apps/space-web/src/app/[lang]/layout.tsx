import type { Metadata, Viewport } from 'next'
import { Barlow_Condensed, Manrope } from 'next/font/google'
import { notFound } from 'next/navigation'

import { Motion } from '@/components/motion'
import { dictionaryFor } from '@/content'
import type { LocaleLayoutProps, LocaleParams } from '@/lib/route'
import { isLocale, LOCALES } from '@/lib/locale'
import { pageMetadata, SITE_NAME, SITE_URL } from '@/lib/site'
import { serializeStructuredData, structuredData } from '@/lib/structured-data'

import '@allfitone/react/tokens.css'
import '@allfitone/react/styles.css'
import '../space.css'

const display = Barlow_Condensed({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
})

const body = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
})

export const dynamicParams = false

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }))
}

export const viewport: Viewport = {
  themeColor: '#05090F',
  colorScheme: 'dark',
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang)) return {}
  const { meta } = dictionaryFor(lang)
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    ...pageMetadata(lang, '', { title: meta.title, description: meta.description }),
    icons: { icon: [{ url: '/brand/favicon.svg', type: 'image/svg+xml' }] },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  }
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const copy = dictionaryFor(lang)
  return (
    <html lang={lang} data-afo-theme="dark" className={`${display.variable} ${body.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData(lang)) }}
        />
        <a className="skip" href="#content">
          {copy.nav.skip}
        </a>
        {children}
        <Motion />
      </body>
    </html>
  )
}
