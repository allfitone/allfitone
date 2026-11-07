'use client'

/**
 * «Cada récord se cuenta»: the share flow told in three steps while the section
 * holds still.
 *
 * On wide screens the section is three viewports tall and its content sticks;
 * three invisible markers, one per viewport, decide the step as they cross the
 * middle of the screen. On narrow screens nothing sticks, and the steps sit
 * under the phone. The story never advances on its own: each step is a button,
 * which shows its card on narrow screens and scrolls to its marker on wide ones.
 */

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import {
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  ExpandIcon,
  FavouriteIcon,
  ForwardIcon,
  ImageIcon,
} from '@allfitone/react/icons'

import type { Dictionary } from '@/content'

import { Phone } from './phone'
import { Title } from './title'

const CARDS = ['/images/cards/card5.webp', '/images/cards/card2.webp', '/images/cards/photoA.webp']
const STICKY = '(min-width: 961px)'

export function Records({ copy }: { copy: Dictionary['records'] }) {
  const section = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const element = section.current
    if (!element || !window.matchMedia(STICKY).matches) return
    const markers = [...element.querySelectorAll<HTMLElement>('[data-marker]')]
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setStep(markers.findIndex((marker) => marker === entry.target))
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    )
    for (const marker of markers) observer.observe(marker)
    return () => observer.disconnect()
  }, [])

  // While the section sticks, the scroll position owns the step, so a step scrolls there.
  function show(index: number) {
    const marker = section.current?.querySelectorAll<HTMLElement>('[data-marker]')[index]
    if (marker && window.matchMedia(STICKY).matches) marker.scrollIntoView({ block: 'center' })
    else setStep(index)
  }

  return (
    <section ref={section} className="records" aria-labelledby="records-title">
      <div className="records__markers" aria-hidden="true">
        {CARDS.map((card) => (
          <div key={card} data-marker="" />
        ))}
      </div>
      <div className="records__sticky">
        <div className="records__photo">
          <Image src="/images/photos/records.webp" alt="" fill sizes="100vw" />
        </div>
        <div className="records__veil" />
        <div className="wrap records__grid">
          <div className="records__copy">
            <Title id="records-title" lines={copy.title} size="xl" />
            <p className="lead">{copy.lead}</p>
          </div>
          <ol className="steps">
            {copy.steps.map((item, index) => (
              <li key={item.verb}>
                <button
                  type="button"
                  className="step"
                  aria-controls="records-story"
                  aria-current={index === step ? 'step' : undefined}
                  onClick={() => show(index)}
                >
                  <span className="step__verb">{item.verb}</span>
                  <span className="step__text">{item.text}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="records__stage">
            <figure
              id="records-story"
              className="story"
              data-step={step}
              aria-label={copy.editor.label}
            >
              <Phone>
                <span className="story__close" aria-hidden="true">
                  <CloseIcon size="md" decorative />
                </span>
                <span className="story__tools" aria-hidden="true">
                  <span className="story__tool story__tool--text">Aa</span>
                  <span className="story__tool">
                    <ImageIcon size="md" decorative />
                  </span>
                  <span className="story__tool">
                    <FavouriteIcon size="md" decorative />
                  </span>
                  <span className="story__tool">
                    <DownloadIcon size="md" decorative />
                  </span>
                  <span className="story__tool story__tool--more">
                    <ExpandIcon size="sm" decorative />
                  </span>
                </span>
                <span className="story__toast" aria-hidden="true">
                  <CheckIcon size="sm" decorative />
                  {copy.editor.published}
                </span>
                <span className="story__cards">
                  {CARDS.map((card, index) => (
                    <span key={card} className="story__card" data-active={String(index === step)}>
                      <Image
                        src={card}
                        alt={index === step ? (copy.cards[index] ?? '') : ''}
                        width={640}
                        height={1136}
                        sizes="280px"
                      />
                    </span>
                  ))}
                </span>
                <p className="story__caption" aria-hidden="true">
                  {copy.editor.caption}
                </p>
                <span className="story__bar" aria-hidden="true">
                  <span className="story__pill story__pill--story">
                    <span className="story__avatar" />
                    {copy.editor.story}
                  </span>
                  <span className="story__pill">
                    <span className="story__star">
                      <FavouriteIcon size="xs" decorative />
                    </span>
                    {copy.editor.friends}
                  </span>
                  <span className="story__send">
                    <ForwardIcon size="md" decorative />
                  </span>
                </span>
              </Phone>
            </figure>
          </div>
        </div>
      </div>
    </section>
  )
}
