import type { Metadata } from 'next'
import { Barlow_Condensed, Manrope } from 'next/font/google'

/**
 * What every document Studio serves has in common.
 *
 * Studio has two root layouts: the landing under `[lang]`, which speaks Spanish
 * and English, and the workspace under `(workspace)`, which speaks Spanish. Only
 * a root layout can set `<html lang>`, so a bilingual landing needs its own. The
 * pages that stand in for a root layout — `global-error` and `global-not-found`
 * — draw on the same fonts and icon, and repeat the same stylesheet imports.
 *
 * Moving between the two layouts is a full page load. Nothing loses by it: the
 * landing's ways in are plain anchors, and a session ending in the workspace
 * already leaves with `window.location.replace`.
 */

const display = Barlow_Condensed({
  subsets: ['latin'],
  variable: '--afo-app-font-display',
  weight: ['500', '600', '700', '800'],
})

const body = Manrope({
  subsets: ['latin'],
  variable: '--afo-app-font-body',
})

export const studioFontVariables = `${display.variable} ${body.variable}`

export const studioIcons: Metadata['icons'] = {
  icon: [
    {
      url: '/brand/allfit-one/favicon/allfit-one-favicon-cyan.svg',
      type: 'image/svg+xml',
    },
  ],
  shortcut: '/brand/allfit-one/favicon/allfit-one-favicon-cyan.svg',
}
