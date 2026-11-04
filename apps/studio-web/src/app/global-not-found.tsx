import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { buttonVariants } from '@allfitone/react/components/button'
import type { Metadata } from 'next'

import { StudioFrame } from '@/components/studio-frame'

import { studioFontVariables, studioIcons } from './document'

import '@allfitone/react/tokens.css'
import '@allfitone/react/app.css'
import '@allfitone/react/styles.css'
import './studio.composition.css'

/**
 * Without this file Next answers an unknown address with its own built-in page:
 * an unstyled "404 — This page could not be found", in English, with no brand
 * and no way back. A typo, a stale bookmark or an old link in an email all reach
 * it, so it is a screen of the product whether or not anyone designed one.
 *
 * It is the global variant because Studio has two root layouts — the landing's
 * and the workspace's — and an address that matches neither belongs to no
 * layout to render inside. So, like `global-error`, it brings its own document.
 *
 * It borrows the stage the entry error uses rather than inventing a layout: the
 * same frame, the same centred alert, the same measure. `showLogout` stays off
 * because this page knows nothing about the session, and "Volver a Studio"
 * needs none — `/app` resolves where each person belongs on its own.
 */
export const metadata: Metadata = {
  title: 'Allfit Studio',
  icons: studioIcons,
}

export default function GlobalNotFound() {
  return (
    <html lang="es" data-afo-theme="light" className={studioFontVariables}>
      <body>
        <StudioFrame showLogout={false}>
          <div data-studio-error-stage>
            <Alert variant="warning">
              <AlertTitle role="heading" aria-level={1}>
                Esta página no existe
              </AlertTitle>
              <AlertDescription>
                La dirección puede estar mal escrita, o lo que buscabas ya no está donde estaba.
              </AlertDescription>
              <AlertAction>
                {/* Default size, like the other three error stages. `lg` belongs to
                    the entry panel, where the action is the point of the screen. */}
                <a
                  href="/app"
                  data-slot="button"
                  data-variant="default"
                  className={buttonVariants()}
                >
                  Volver a Studio
                </a>
              </AlertAction>
            </Alert>
          </div>
        </StudioFrame>
      </body>
    </html>
  )
}
