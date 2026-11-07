import { useEffect, type RefObject } from 'react'

/**
 * The landing's motion layer: `[data-reveal]` elements get `is-in` the first
 * time they enter the viewport, and nothing else moves with the scroll or the
 * pointer. Each section spends its motion once — its title rises, then one
 * object follows it — so only a title and that object carry the attribute.
 *
 * Reveals only arm once `[data-motion='on']` is set here, so the page reads
 * whole without JavaScript, and reduced motion gets the final state at once.
 *
 * Deliberately a copy of the Space landing's `Motion`, not a shared package:
 * it is scoped to the landing's root instead of the document, and each site
 * owns its own motion.
 */
export function useLandingMotion(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const site = root.current
    if (!site) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    site.dataset.motion = 'on'

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
    for (const element of site.querySelectorAll<HTMLElement>('[data-reveal]')) {
      if (reduced) element.classList.add('is-in')
      else revealer.observe(element)
    }

    return () => {
      revealer.disconnect()
      delete site.dataset.motion
    }
  }, [root])
}
