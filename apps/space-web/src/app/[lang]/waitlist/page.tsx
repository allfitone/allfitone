/**
 * The waitlist page, where the landing's actions and every shared referral link
 * lead. The offer is the title; the form sits beside it from 1081px and stays in
 * view while the context scrolls: the Founding Members, the referral levels,
 * what Allfit Pro is and the terms. Below that width the form comes right after
 * the lead, so the action is never more than a screen away.
 *
 * The title rises once, on load, the page's one moment of motion. The context
 * is a document: sentence-case headings, hairlines and term–value rows, with no
 * cards or labels above headings. The one exception is the referral levels,
 * drawn as the landing's tiles so the table reads the same on both pages; the
 * form's panel takes the cyan edge, since it is the one place to act.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { ReferralLevels } from '@/components/referral-levels'
import { Title } from '@/components/title'
import { WaitlistForm } from '@/components/waitlist-form'
import { dictionaryFor } from '@/content'
import type { LocaleParams } from '@/lib/route'
import { isLocale } from '@/lib/locale'
import { pageMetadata } from '@/lib/site'
import { WAITLIST_PATH } from '@/lib/waitlist'

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang)) return {}
  const { meta } = dictionaryFor(lang).waitlistPage
  return pageMetadata(lang, WAITLIST_PATH, meta)
}

export default async function WaitlistPage({ params }: LocaleParams) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const copy = dictionaryFor(lang)
  const page = copy.waitlistPage
  // «{count} referidos activos»: the tile sets the count apart, so the unit goes alone.
  const referralUnit = copy.referrals.people.replace('{count}', '').trim()

  return (
    <>
      <Header locale={lang} copy={copy.nav} path={WAITLIST_PATH} sections={false} />
      <main id="content" className="join">
        <div className="wrap join__grid">
          <header className="join__intro">
            <Title as="h1" lines={page.title} highlight={page.highlight} reveal={false} />
            <p className="lead">{page.lead}</p>
          </header>

          <section className="join__form" aria-labelledby="join-title">
            <div className="join-panel">
              <h2 id="join-title" className="join-panel__title">
                {page.joinTitle}
              </h2>
              <WaitlistForm locale={lang} copy={copy.form} newWindow={copy.footer.newWindow} />
            </div>
          </section>

          <div className="join__details">
            <section className="terms-block" aria-labelledby="founding-title">
              <h2 id="founding-title">{copy.founding.title}</h2>
              <Rows rows={copy.founding.rows} />
            </section>

            <section className="terms-block" aria-labelledby="referrals-title">
              <h2 id="referrals-title">{copy.referrals.title}</h2>
              <p>{copy.referrals.text}</p>
              <ReferralLevels rewards={copy.referrals.rewards} unit={referralUnit} />
              <p className="terms-block__note">{copy.referrals.note}</p>
            </section>

            <section className="terms-block" aria-labelledby="pro-title">
              <h2 id="pro-title">{page.pro.title}</h2>
              <p>{page.pro.text}</p>
              <Rows rows={page.pro.rows} />
            </section>

            <section id="terms" className="terms-block" aria-labelledby="terms-title">
              <h2 id="terms-title">{page.terms.title}</h2>
              <ul className="terms-block__list">
                {page.terms.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </main>
      <Footer locale={lang} copy={copy} />
    </>
  )
}

/** Term and value pairs: the condition dimmed on the left, what follows at full strength. */
function Rows({ rows }: { rows: readonly { term: string; value: string }[] }) {
  return (
    <dl className="terms-block__rows">
      {rows.map(({ term, value }) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
