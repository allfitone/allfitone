/**
 * The Space landing, in the order the story is told: what the app is (hero),
 * what using it looks like (from the first set to the last bite), where to
 * start (programmes), why it is safe (your data is yours), what you get to show
 * (every record counts), what it costs (Pro, included when a gym or coach
 * pays for Allfit Studio; its free plan does not), the waitlist and the close.
 * Every screen shown is a real capture of the app.
 *
 * The app is not in the stores yet, so the page converts to the waitlist: the
 * hero's and the header's actions open the waitlist page, where the offer and
 * its terms are, and the landing keeps its own form near the end, with nothing
 * under it but the privacy policy beside the authorization.
 *
 * Motion is spent once per section: the hero enters on load, each title rises
 * out of its masks, and one main object follows it (the feature cards, the
 * programme cards, the sharing screen, the Pro card). Leads, pillars, links,
 * the store buttons and the form stay still. There is no marquee, progress bar,
 * pointer light, parallax or glow; do not add them back.
 */

import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalIcon, FoundationIcon } from '@allfitone/react/icons'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { Phone } from '@/components/phone'
import { Records } from '@/components/records'
import { ReferralLevels } from '@/components/referral-levels'
import { Stores } from '@/components/stores'
import { Title } from '@/components/title'
import { WaitlistForm } from '@/components/waitlist-form'
import { dictionaryFor } from '@/content'
import type { LocaleParams } from '@/lib/route'
import { isLocale } from '@/lib/locale'
import { WAITLIST_PATH } from '@/lib/waitlist'

const FEATURE_SCREENS = [
  '/images/screens/hoy-historial.webp',
  '/images/screens/sesion.webp',
  '/images/screens/comida.webp',
]

const PROGRAM_PHOTOS = [
  '/images/photos/program-upper-lower.webp',
  '/images/photos/program-strength.webp',
  '/images/photos/program-half-marathon.webp',
  '/images/photos/program-ppl.webp',
]

export default async function Landing({ params }: LocaleParams) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const copy = dictionaryFor(lang)

  return (
    <>
      <Header locale={lang} copy={copy.nav} />
      <main id="content">
        <section className="hero" aria-labelledby="hero-title">
          <div className="wrap hero__grid">
            <div className="hero__copy">
              <Title
                as="h1"
                id="hero-title"
                lines={copy.hero.lines}
                tones={['solid', 'ghost', 'cyan']}
                size="xl"
                reveal={false}
              />
              <p className="lead">{copy.hero.lead}</p>
              <div className="hero__actions">
                <Link className="cta" href={`/${lang}${WAITLIST_PATH}`}>
                  {copy.hero.join}
                  <FoundationIcon name="forward" size="sm" decorative />
                </Link>
                <Stores copy={copy.stores} />
              </div>
            </div>
            <div className="hero__phones">
              <div className="hero__phone hero__phone--back">
                <Phone
                  src="/images/screens/programa.webp"
                  alt={copy.hero.programAlt}
                  priority
                  sizes="262px"
                />
              </div>
              <div className="hero__phone hero__phone--front">
                <Phone
                  src="/images/screens/hoy.webp"
                  alt={copy.hero.todayAlt}
                  priority
                  sizes="316px"
                />
              </div>
            </div>
          </div>
        </section>

        <section id="app" className="section" aria-labelledby="features-title">
          <div className="wrap">
            <div className="section__head">
              <Title id="features-title" lines={copy.features.title} />
            </div>
            <div className="features__grid">
              {copy.features.cards.map((card, index) => (
                <article
                  key={card.title}
                  className="feature"
                  data-reveal=""
                  style={{ '--i': index }}
                >
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                  <Phone
                    className="feature__phone"
                    src={FEATURE_SCREENS[index]}
                    alt={card.alt}
                    sizes="300px"
                  />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="programs" className="section" aria-labelledby="programs-title">
          <div className="wrap">
            <div className="section__head section__head--split">
              <Title id="programs-title" lines={copy.programs.title} />
              <p className="lead">{copy.programs.lead}</p>
            </div>
            <ul
              className="programs__grid"
              role="list"
              tabIndex={0}
              aria-labelledby="programs-title"
            >
              {copy.programs.items.map((program, index) => (
                <li
                  key={program.name}
                  className="program"
                  data-reveal="card"
                  style={{ '--i': index }}
                >
                  <div className="program__photo">
                    {PROGRAM_PHOTOS[index] ? (
                      <Image
                        src={PROGRAM_PHOTOS[index]}
                        alt=""
                        fill
                        quality={88}
                        sizes="(max-width: 1080px) 72vw, 310px"
                      />
                    ) : null}
                  </div>
                  <h3>{program.name}</h3>
                  <p>{program.meta}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="privacy" className="section" aria-labelledby="privacy-title">
          <div className="wrap">
            <div className="privacy__top">
              <div className="privacy__copy">
                <Title id="privacy-title" lines={copy.privacy.title} size="xl" />
                <p className="lead">{copy.privacy.lead}</p>
              </div>
              <div className="privacy__stage" data-reveal="">
                <Phone
                  className="privacy__phone"
                  src="/images/screens/sharing.webp"
                  alt={copy.privacy.alt}
                  sizes="320px"
                />
              </div>
            </div>
            <ul className="pillars" role="list">
              {copy.privacy.pillars.map((pillar) => (
                <li key={pillar.title} className="pillar">
                  <h3>{pillar.title}</h3>
                  <p>{pillar.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Records copy={copy.records} />

        <section className="invite-section" aria-labelledby="invite-title">
          <div className="wrap">
            <div className="invite" data-reveal="">
              <div className="invite__copy">
                <Title
                  id="invite-title"
                  lines={copy.invite.title}
                  highlight={copy.invite.highlight}
                  reveal={false}
                />
                <p>{copy.invite.text}</p>
              </div>
              <ReferralLevels rewards={copy.invite.rewards} openEnded />
            </div>
          </div>
        </section>

        <section id="gyms" className="section" aria-labelledby="pro-title">
          <div className="wrap">
            <div className="pro" data-reveal="">
              <div className="pro__copy">
                <Title
                  id="pro-title"
                  lines={copy.pro.title}
                  highlight={copy.pro.highlight}
                  reveal={false}
                />
                <p className="lead">{copy.pro.text}</p>
              </div>
              <div className="pro__photo">
                <Image
                  src="/images/photos/pro-curl.webp"
                  alt={copy.pro.alt}
                  fill
                  quality={88}
                  sizes="(max-width: 900px) 100vw, 648px"
                />
              </div>
            </div>
            <div className="studio">
              <div>
                <h3>{copy.studio.title}</h3>
                <p>{copy.studio.text}</p>
              </div>
              <a
                className="pill-link"
                href={`https://studio.allfit.one/${lang}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {copy.studio.cta}
                <ExternalIcon size="sm" decorative />
                <span className="sr-only"> {copy.footer.newWindow}</span>
              </a>
            </div>
          </div>
        </section>

        <section id="waitlist" className="section waitlist" aria-labelledby="waitlist-title">
          <div className="wrap waitlist__grid">
            <div className="waitlist__copy">
              <Title id="waitlist-title" lines={copy.waitlist.title} tones={['solid', 'cyan']} />
              <p className="lead">{copy.waitlist.lead}</p>
            </div>
            <div className="join-panel">
              <WaitlistForm locale={lang} copy={copy.form} newWindow={copy.footer.newWindow} />
            </div>
          </div>
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <div className="closing__photo">
            <Image src="/images/photos/closing.webp" alt="" fill sizes="100vw" />
          </div>
          <div className="wrap closing__inner">
            <Title id="closing-title" lines={copy.closing.title} />
            <Stores copy={copy.stores} />
          </div>
        </section>
      </main>
      <Footer locale={lang} copy={copy} />
    </>
  )
}
