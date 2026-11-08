'use client'

import { ProductLockup } from '@allfitone/react/brand'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { buttonVariants } from '@allfitone/react/components/button'
import {
  SiteContainer,
  SiteFooter,
  SiteFooterBar,
  SiteFooterLink,
  SiteFooterLinks,
  SiteFooterMeta,
  SiteFooterPartner,
  SiteFooterPartnerLegal,
  SiteFooterPartnerText,
  SiteHeader,
  SiteHeaderActions,
  SiteHeaderHome,
  SiteHeaderLink,
  SiteHeaderNav,
  SiteLanguageLink,
  SiteLanguageSwitch,
} from '@allfitone/react/components/site-shell'
import { ExternalIcon, ForwardIcon, FoundationIcon, type IconName } from '@allfitone/react/icons'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState, type MouseEvent } from 'react'

import type { Dictionary } from '@/content'
import { useLandingMotion } from './landing-motion'
import { readPendingInvitationToken } from '@/lib/invitation-token'
import { legalUrl, type LegalDocument } from '@/lib/legal'
import { LOCALES, type Locale } from '@/lib/locale'
import { prepareStudioAuthentication, readStudioSessionActivity } from '@/lib/session-activity'
import { studioApi } from '@/lib/studio-api'

/**
 * What a signed-out visitor to studio.allfit.one sees first: what Studio is,
 * then the way in. It belongs to the same family as the Allfit Space landing —
 * the shared site header and footer, its condensed display titles and tall
 * product cards — on a white canvas instead of Space's night.
 *
 * One idea carries the page: what a client logs in Space arrives in Studio. The
 * client's data is always drawn on a dark surface (Space's world) set inside the
 * white workspace, so the hero sheet, the sharing card and the session cards all
 * say the same thing without a caption.
 *
 * Every product object is illustrative, never live data. Signing in and creating
 * an account are one hosted flow: there is a single `auth/start`.
 *
 * The page is public and asks the API nothing, so it paints from the server.
 * Who is here is only asked once somebody asks to enter — see `enterStudio`.
 *
 * It speaks Spanish and English, at `/es` and `/en`. Its words come from
 * `@/content`; what stays the same in both languages is declared below.
 *
 * The footer matches the Space landing's: Allfit One and Allfit Space as two
 * buttons, the company's filled and the sibling product's outlined, then the
 * three legal documents on www.allfit.one. Every one of those leaves the
 * landing, so each opens in a new tab and says so in its accessible name.
 */

const AUTH_START_URL = `${studioApi.apiUrl}/studio/v1/auth/start`
const WORKSPACE_ENTRY = '/app'

const NVIDIA_TRADEMARK =
  '© 2026 NVIDIA, the NVIDIA logo, and NVIDIA Inception are trademarks and/or registered trademarks of NVIDIA Corporation in the U.S. and other countries.'

type Tone = 'solid' | 'ghost' | 'accent'

/** A display title whose lines rise one after another, as on the Space landing:
 *  the hero's on load, every other one the first time it scrolls into view. Only
 *  the hero's lines change tone; every section title is one colour. */
function Title({
  as: Tag = 'h2',
  id,
  lines,
  tones = [],
}: {
  as?: 'h1' | 'h2'
  id: string
  lines: readonly string[]
  tones?: readonly Tone[]
}) {
  return (
    <Tag
      id={id}
      data-studio-display={Tag === 'h1' ? 'hero' : 'section'}
      data-reveal={Tag === 'h1' ? undefined : 'mask'}
    >
      {lines.map((line, index) => (
        <span
          key={line}
          data-studio-display-line
          data-line={index}
          data-tone={tones[index] ?? 'solid'}
        >
          <span>{line}</span>
        </span>
      ))}
    </Tag>
  )
}

/** Illustrative only: one client's session, planned against logged. */
const SHEET_ROWS = [
  { exercise: 'squat', planned: '4 × 6', logged: '4 × 6' },
  { exercise: 'bench', planned: '4 × 8', logged: '3 × 8', direction: 'below' },
  { exercise: 'row', planned: '3 × 10', logged: '3 × 12', direction: 'above' },
  { exercise: 'deadlift', planned: '3 × 8', logged: '3 × 8' },
] as const

const ROSTER = [
  { key: 'laura', initials: 'LM', name: 'Laura Méndez' },
  { key: 'camilo', initials: 'CR', name: 'Camilo Rojas' },
  { key: 'valentina', initials: 'VP', name: 'Valentina Pardo' },
] as const

const STEPS = ['invite', 'versions', 'week'] as const

const LEGAL: readonly LegalDocument[] = ['terms', 'privacy', 'analytics']

const VERSIONS = [
  { label: 'v3', current: true },
  { label: 'v2', current: false },
  { label: 'v1', current: false },
] as const

const WEEK = [
  { day: 'mon', done: 4, planned: 4 },
  { day: 'tue', done: 0, planned: 0 },
  { day: 'wed', done: 5, planned: 5 },
  { day: 'thu', done: 0, planned: 0 },
  { day: 'fri', done: 3, planned: 4 },
  { day: 'sat', done: 0, planned: 3 },
] as const

const SHARING = [
  { category: 'training', shared: true },
  { category: 'progress', shared: true },
  { category: 'nutrition', shared: false },
  { category: 'health', shared: false },
] as const

const PILLARS: readonly (keyof Dictionary['privacy']['pillars'])[] = [
  'consent',
  'purpose',
  'history',
]

const MODULES: readonly { key: keyof Dictionary['modules']['items']; icon: IconName }[] = [
  { key: 'people', icon: 'people' },
  { key: 'training', icon: 'training' },
  { key: 'progress', icon: 'progress' },
  { key: 'team', icon: 'team' },
  { key: 'plans', icon: 'business' },
]

function SharingList({ copy }: { copy: Dictionary['sharing'] }) {
  return (
    <ul data-studio-object-list>
      {SHARING.map((item) => (
        <li key={item.category} data-shared={item.shared ? 'true' : 'false'}>
          <span>{copy.categories[item.category]}</span>
          <span data-studio-object-state>{item.shared ? copy.shared : copy.notShared}</span>
        </li>
      ))}
    </ul>
  )
}

function StepObject({ kind, copy }: { kind: (typeof STEPS)[number]; copy: Dictionary }) {
  if (kind === 'invite') {
    return (
      <div data-studio-object="invite" data-afo-theme="dark">
        <div data-studio-object-person>
          <span data-studio-avatar>CR</span>
          <span>
            <strong>Camilo Rojas</strong>
            <small>{copy.people.camilo}</small>
          </span>
        </div>
        <SharingList copy={copy.sharing} />
      </div>
    )
  }

  if (kind === 'versions') {
    return (
      <div data-studio-object="versions">
        <p data-studio-object-heading>
          <strong>{copy.how.versions.template}</strong>
          <small>Laura Méndez</small>
        </p>
        <ol data-studio-versions>
          {VERSIONS.map((version) => (
            <li key={version.label} data-current={version.current ? 'true' : undefined}>
              <span data-studio-version-label>{version.label}</span>
              <span>{copy.how.versions.notes[version.label]}</span>
              {version.current ? (
                <span data-studio-version-current>{copy.how.versions.current}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div data-studio-object="week" data-afo-theme="dark">
      <p data-studio-object-heading>
        <strong>{copy.how.week.title}</strong>
        <small>{copy.how.week.count}</small>
      </p>
      <ol data-studio-week>
        {WEEK.map((day) => (
          <li
            key={day.day}
            data-rest={day.planned === 0 ? 'true' : undefined}
            data-planned={day.planned}
            data-done={day.done}
          >
            <span data-studio-week-bar>
              <span data-studio-week-fill />
            </span>
            <span data-studio-week-day>{copy.how.week.days[day.day]}</span>
          </li>
        ))}
      </ol>
      <p data-studio-object-note>{copy.how.week.note}</p>
    </div>
  )
}

/**
 * Where "Entrar" goes is decided on click, because only this browser knows
 * whether it holds a Studio session. Known absent: straight to the provider.
 * Anything else goes to the workspace entry, whose guard verifies before it
 * trusts — a session ended here may still be open at the API. The anchor keeps
 * that safe target until hydration, and the default action reads the href
 * after this handler, so new tabs and modifier keys still behave as links do.
 */
function enterStudio(event: MouseEvent<HTMLAnchorElement>): void {
  const stored = readStudioSessionActivity()
  const signedOut =
    stored === undefined || (stored.status === 'ended' && stored.confirmedAt !== undefined)
  if (signedOut) prepareStudioAuthentication()
  event.currentTarget.href = signedOut ? AUTH_START_URL : WORKSPACE_ENTRY
}

const RETURN_REASONS = [
  { param: 'logout', value: 'partial' },
  { param: 'access', value: 'expired' },
] as const

/**
 * The API returns here with a reason in the address: `?logout=partial` when only
 * this browser's half of the close could be confirmed, `?access=expired` when a
 * sign-in outlived its ten-minute state. Read once, then dropped from the address
 * bar so a reload does not repeat it; Next's own history state keeps the router out.
 */
function ReturnNotice({ copy }: { copy: Dictionary }) {
  const searchParams = useSearchParams()
  const [reason] = useState(() =>
    RETURN_REASONS.find(({ param, value }) => searchParams.get(param) === value),
  )

  useEffect(() => {
    if (!reason) return
    const url = new URL(window.location.href)
    url.searchParams.delete(reason.param)
    window.history.replaceState(window.history.state, '', url)
  }, [reason])

  if (reason?.param === 'logout') {
    return (
      <Alert variant="warning" live="polite">
        <AlertTitle>{copy.partialLogout.title}</AlertTitle>
        <AlertDescription>{copy.partialLogout.description}</AlertDescription>
      </Alert>
    )
  }
  if (reason?.param === 'access') {
    return (
      <Alert variant="warning" live="polite">
        <AlertTitle>{copy.expiredAccess.title}</AlertTitle>
        <AlertDescription>{copy.expiredAccess.description}</AlertDescription>
        <AlertAction>
          <a
            data-slot="button"
            data-variant="outline"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
            href={WORKSPACE_ENTRY}
            onClick={enterStudio}
          >
            {copy.expiredAccess.action}
          </a>
        </AlertAction>
      </Alert>
    )
  }
  return null
}

export function StudioLanding({ locale, copy }: { locale: Locale; copy: Dictionary }) {
  const router = useRouter()
  const site = useRef<HTMLDivElement>(null)
  useLandingMotion(site)
  const parentSiteUrl = `https://www.allfit.one/${locale}`
  const spaceSiteUrl = `https://space.allfit.one/${locale}`
  const family = [
    { name: 'Allfit One', href: parentSiteUrl, variant: 'default' },
    { name: 'Allfit Space', href: spaceSiteUrl, variant: 'outline' },
  ] as const

  // A tab that opened an invitation belongs on it, including after a close the
  // recovery lock forced on the way: that close always returns here.
  useEffect(() => {
    if (readPendingInvitationToken()) router.replace('/invitations')
  }, [router])

  return (
    <div data-studio-site ref={site}>
      <SiteHeader data-studio-header>
        {/* Not a link: this page is home. */}
        <SiteHeaderHome render={<div />}>
          <ProductLockup product="studio" surface="light" title="Allfit Studio" />
        </SiteHeaderHome>
        <SiteHeaderNav aria-label={copy.nav.label}>
          <SiteHeaderLink href="#como-funciona">{copy.nav.how}</SiteHeaderLink>
          <SiteHeaderLink href="#privacidad">{copy.nav.privacy}</SiteHeaderLink>
          <SiteHeaderLink href="#modulos">{copy.nav.modules}</SiteHeaderLink>
        </SiteHeaderNav>
        <SiteHeaderActions>
          <SiteLanguageSwitch aria-label={copy.nav.language}>
            {LOCALES.map((option) => (
              <SiteLanguageLink
                key={option}
                render={<Link href={`/${option}`} />}
                hrefLang={option}
                lang={option}
                current={option === locale}
              >
                {option.toUpperCase()}
              </SiteLanguageLink>
            ))}
          </SiteLanguageSwitch>
          {/* It steps aside with the section links below 60rem, where the hero's
              own way in is on screen and the consent panel needs the room. */}
          <a
            data-studio-header-action
            data-slot="button"
            data-variant="outline"
            className={buttonVariants({ variant: 'outline' })}
            href={WORKSPACE_ENTRY}
            onClick={enterStudio}
          >
            {copy.nav.enter}
          </a>
        </SiteHeaderActions>
      </SiteHeader>

      <main id="contenido" data-studio-landing>
        <section data-studio-hero aria-labelledby="studio-landing-title">
          <SiteContainer data-studio-hero-grid>
            <div data-studio-hero-copy>
              {/* Only this notice depends on the address, so only it waits for the client. */}
              <Suspense fallback={null}>
                <ReturnNotice copy={copy} />
              </Suspense>
              <Title
                as="h1"
                id="studio-landing-title"
                lines={copy.hero.title}
                tones={['solid', 'solid', 'accent', 'accent']}
              />
              <p data-studio-lead>{copy.hero.lead}</p>
              <div data-studio-actions>
                <a
                  data-slot="button"
                  data-variant="default"
                  data-studio-action
                  className={buttonVariants({ size: 'lg' })}
                  href={WORKSPACE_ENTRY}
                  onClick={enterStudio}
                >
                  {copy.hero.cta}
                  <ForwardIcon data-icon="inline-end" decorative />
                </a>
                <p data-studio-note>{copy.hero.note}</p>
              </div>
            </div>

            {/* The client's session, drawn on Space's night, arriving in the white workspace. */}
            <figure data-studio-hero-stage aria-hidden="true">
              <div data-studio-sheet data-afo-theme="dark">
                <div data-studio-sheet-head>
                  <span data-studio-avatar>LM</span>
                  <span>
                    <strong>Laura Méndez</strong>
                    <small>{copy.sheet.program}</small>
                  </span>
                </div>
                <p data-studio-sheet-shared>
                  <FoundationIcon name="permissions" decorative />
                  {copy.sheet.shared}
                </p>
                <div data-studio-sheet-grid>
                  <span data-studio-sheet-column>{copy.sheet.columns.exercise}</span>
                  <span data-studio-sheet-column>{copy.sheet.columns.planned}</span>
                  <span data-studio-sheet-column>{copy.sheet.columns.logged}</span>
                  {SHEET_ROWS.map((row, index) => (
                    <div key={row.exercise} data-studio-sheet-row data-row={index}>
                      <span data-studio-sheet-exercise>
                        {copy.sheet.exercises[row.exercise]}
                        {'direction' in row ? (
                          <span data-studio-sheet-change data-direction={row.direction}>
                            {copy.sheet.changes[row.exercise]}
                          </span>
                        ) : null}
                      </span>
                      <span data-studio-sheet-value>{row.planned}</span>
                      <span
                        data-studio-sheet-value
                        data-studio-sheet-logged
                        data-direction={'direction' in row ? row.direction : undefined}
                      >
                        {row.logged}
                      </span>
                    </div>
                  ))}
                </div>
                <p data-studio-sheet-foot>{copy.sheet.footer}</p>
              </div>
            </figure>
          </SiteContainer>
        </section>

        <section id="como-funciona" data-studio-section aria-labelledby="studio-landing-how">
          <SiteContainer>
            <div data-studio-section-head>
              <Title id="studio-landing-how" lines={copy.how.title} />
            </div>
            <ul data-studio-steps data-reveal="card">
              {STEPS.map((step) => (
                <li key={step} data-studio-step>
                  <h3>{copy.how.steps[step].title}</h3>
                  <p>{copy.how.steps[step].text}</p>
                  <div data-studio-step-stage aria-hidden="true">
                    <StepObject kind={step} copy={copy} />
                  </div>
                </li>
              ))}
            </ul>
          </SiteContainer>
        </section>

        <section
          id="privacidad"
          data-studio-section
          data-studio-band
          data-afo-theme="dark"
          aria-labelledby="studio-landing-privacy"
        >
          <SiteContainer>
            <div data-studio-privacy>
              <div data-studio-privacy-copy>
                <Title id="studio-landing-privacy" lines={copy.privacy.title} />
                <p data-studio-lead>{copy.privacy.lead}</p>
              </div>
              <div data-studio-privacy-stage aria-hidden="true" data-reveal>
                <div data-studio-object="invite">
                  <div data-studio-object-person>
                    <span data-studio-avatar>LM</span>
                    <span>
                      <strong>Laura Méndez</strong>
                      <small>{copy.sharing.yours}</small>
                    </span>
                  </div>
                  <SharingList copy={copy.sharing} />
                </div>
              </div>
            </div>
            <ul data-studio-pillars>
              {PILLARS.map((pillar) => (
                <li key={pillar} data-studio-pillar>
                  <h3>{copy.privacy.pillars[pillar].title}</h3>
                  <p>{copy.privacy.pillars[pillar].text}</p>
                </li>
              ))}
            </ul>
          </SiteContainer>
        </section>

        <section id="modulos" data-studio-section aria-labelledby="studio-landing-modules">
          <SiteContainer>
            <div data-studio-section-head data-split="true">
              <Title id="studio-landing-modules" lines={copy.modules.title} />
              <p data-studio-lead>{copy.modules.lead}</p>
            </div>
            <div data-studio-modules-grid>
              <ol data-studio-modules>
                {MODULES.map((module) => (
                  <li key={module.key} data-studio-module>
                    <h3>{copy.modules.items[module.key].name}</h3>
                    <p>{copy.modules.items[module.key].description}</p>
                  </li>
                ))}
              </ol>

              {/* The workspace itself: the sidebar these five become, open on Personas. */}
              <div data-studio-workspace aria-hidden="true" data-reveal="card">
                <div data-studio-workspace-nav data-afo-theme="dark">
                  <ProductLockup product="studio" surface="dark" />
                  <ul>
                    {MODULES.map((module) => (
                      <li key={module.key}>
                        <FoundationIcon name={module.icon} decorative />
                        <span>{copy.modules.items[module.key].name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div data-studio-workspace-main>
                  <p data-studio-workspace-title>{copy.people.title}</p>
                  <ul data-studio-workspace-list>
                    {ROSTER.map((person) => (
                      <li key={person.key}>
                        <span data-studio-avatar>{person.initials}</span>
                        <span>
                          <strong>{person.name}</strong>
                          <small>{copy.people[person.key]}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Space's night, because this is the one thing here that is Space. */}
            <div data-studio-space data-afo-theme="dark">
              <ProductLockup product="space" surface="dark" aria-hidden="true" />
              <div>
                <h3>{copy.modules.space.title}</h3>
                <p>{copy.modules.space.text}</p>
              </div>
              <a
                data-slot="button"
                data-variant="secondary"
                className={buttonVariants({ variant: 'secondary', size: 'lg' })}
                href={spaceSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${copy.modules.space.cta} ${copy.links.newTab}`}
              >
                {copy.modules.space.cta}
                <ExternalIcon data-icon="inline-end" decorative />
              </a>
            </div>
          </SiteContainer>
        </section>

        <section data-studio-closing aria-labelledby="studio-landing-closing">
          <SiteContainer data-studio-closing-inner>
            <Title id="studio-landing-closing" lines={copy.closing.title} />
            <div data-studio-closing-actions>
              <a
                data-slot="button"
                data-variant="default"
                data-studio-action
                className={buttonVariants({ size: 'lg' })}
                href={WORKSPACE_ENTRY}
                onClick={enterStudio}
              >
                {copy.closing.cta}
                <ForwardIcon data-icon="inline-end" decorative />
              </a>
              <p data-studio-note>{copy.closing.note}</p>
            </div>
          </SiteContainer>
        </section>
      </main>

      <SiteFooter>
        <SiteFooterPartner>
          <Image
            src="/partners/nvidia-inception-program-badge.svg"
            alt="NVIDIA Inception Program"
            width={200}
            height={86}
          />
          <div>
            <SiteFooterPartnerText>{copy.footer.nvidia}</SiteFooterPartnerText>
            <SiteFooterPartnerLegal lang="en">{NVIDIA_TRADEMARK}</SiteFooterPartnerLegal>
          </div>
        </SiteFooterPartner>
        <SiteFooterBar>
          <div data-studio-footer-family>
            {family.map(({ name, href, variant }) => (
              <a
                key={href}
                data-slot="button"
                data-variant={variant}
                data-studio-action
                className={buttonVariants({ variant })}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${name} ${copy.links.newTab}`}
              >
                {name}
                <ExternalIcon data-icon="inline-end" decorative />
              </a>
            ))}
          </div>
          <SiteFooterLinks>
            {LEGAL.map((document) => (
              <SiteFooterLink
                key={document}
                href={legalUrl(locale, document)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${copy.footer[document]} ${copy.links.newTab}`}
              >
                {copy.footer[document]}
              </SiteFooterLink>
            ))}
          </SiteFooterLinks>
        </SiteFooterBar>
        <SiteFooterMeta>{copy.footer.rights}</SiteFooterMeta>
      </SiteFooter>
    </div>
  )
}
