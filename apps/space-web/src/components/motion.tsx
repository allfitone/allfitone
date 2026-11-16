'use client'

/**
 * The page's motion layer: `[data-reveal]` elements get `is-in` the first time
 * they enter the viewport.
 *
 * Reveals only start once `html[data-motion='on']` is set here, so the page
 * reads fine without JavaScript, and reduced motion gets the final state at
 * once. Nothing follows the pointer: the parallax on the hero phones and the
 * light on the feature cards were removed in November 2026.
 */

import { useEffect } from 'react'

export function Motion() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.documentElement.dataset.motion = 'on'

    const reveals = document.querySelectorAll<HTMLElement>('[data-reveal]')
    const revealer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          revealer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )
    for (const element of reveals) {
      if (reduced) element.classList.add('is-in')
      else revealer.observe(element)
    }

    return () => {
      revealer.disconnect()
    }
  }, [])

  return null
}
