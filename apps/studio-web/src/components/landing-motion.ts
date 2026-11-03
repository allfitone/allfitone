import { useEffect, type RefObject } from 'react'

/**
 * The landing's motion layer, one listener set for the whole page.
 *
 * - `[data-reveal]` elements get `is-in` the first time they enter the viewport.
 * - `[data-spotlight]` elements follow the pointer through `--mx` and `--my`.
 * - `[data-studio-scroll-progress]` grows with the scroll through `--studio-progress`.
 *
 * Values go straight to CSS custom properties instead of React state, so the
 * pointer and the scroll never re-render anything. Reveals only arm once
 * `[data-motion='on']` is set here, so the page reads whole without JavaScript,
 * and reduced motion gets the final state at once.
 *
 * Deliberately a copy of the Space landing's `Motion`, not a shared package:
 * the two already differ — no parallax here, the progress bar is driven by
 * scroll events rather than a scroll timeline, and everything is scoped to the
 * landing's root instead of the document — and each site owns its own motion.
 * The scroll-timeline progress bar is not an option here: Studio's e2e sweeps
 * wait for every finite animation to settle, and one tied to the scroll never
 * does.
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

    let scrollFrame = 0
    const onScroll = () => {
      cancelAnimationFrame(scrollFrame)
      scrollFrame = requestAnimationFrame(() => {
        const travel = document.documentElement.scrollHeight - window.innerHeight
        const progress = travel > 0 ? Math.min(window.scrollY / travel, 1) : 0
        site.style.setProperty('--studio-progress', progress.toFixed(4))
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    let pointerFrame = 0
    const onPointer = (event: PointerEvent) => {
      if (reduced || event.pointerType !== 'mouse') return
      const target = event.target instanceof Element ? event.target : null
      const spot = target?.closest<HTMLElement>('[data-spotlight]')
      if (!spot) return
      cancelAnimationFrame(pointerFrame)
      pointerFrame = requestAnimationFrame(() => {
        const box = spot.getBoundingClientRect()
        spot.style.setProperty('--mx', `${String(event.clientX - box.left)}px`)
        spot.style.setProperty('--my', `${String(event.clientY - box.top)}px`)
      })
    }
    site.addEventListener('pointermove', onPointer, { passive: true })

    return () => {
      revealer.disconnect()
      cancelAnimationFrame(scrollFrame)
      cancelAnimationFrame(pointerFrame)
      window.removeEventListener('scroll', onScroll)
      site.removeEventListener('pointermove', onPointer)
      delete site.dataset.motion
    }
  }, [root])
}
