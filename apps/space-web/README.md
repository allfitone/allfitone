# Allfit Space — web

Public landing of Allfit Space at `space.allfit.one`, in Spanish (`/es`) and
English (`/en`), and the Allfit Space waitlist (`/es/waitlist`). Accounts are
created only in the app; the one form here is the waitlist.

## Local development

From the repository root:

```bash
bun run dev --filter=@allfitone/space-web
```

The site runs at `http://localhost:3200`. `/` redirects to the language the
browser prefers, Spanish by default.

## Content

- Copy lives in `src/content/es.ts` and `src/content/en.ts`. The English
  dictionary is typed after the Spanish one, and `bun test src` rejects missing
  keys, empty strings and lowercase openings.
- Screens are real captures of the Space app, copied on purpose into
  `public/images` as WebP. A web app never imports from another app, so they are
  duplicated rather than shared with `apps/space`.
- The terms and the privacy policy live on www.allfit.one under `/legal`, one
  set for every Allfit One product. The footer links there, and the former
  `/terms` and `/privacy` pages redirect there (`next.config.ts`).

## Waitlist

The landing's actions lead to `/{lang}/waitlist`, the page every shared referral
link opens (`?ref=CODE`); the landing also carries the form in its `#lista`
section. The form posts to this app's own `POST /api/waitlist`, so the browser
never calls the API across origins.

**That endpoint is not built.** It answers `501` until the backend exists
(TECH-292..294); wiring it to the API is TECH-296. Until then the form shows
its failure message, and this branch must not reach `main`, because merging
deploys. The joined state is tested by answering the request in the e2e suite
(`e2e/waitlist.spec.ts`) with the shape `parseJoined` in `src/lib/waitlist.ts`
accepts.

The offer, the referral levels and the terms are in the dictionaries
(`waitlist`, `form`, `founding`, `referrals`, `waitlistPage`). The strategy they
follow is the owner's launch plan of 2026-11-07.

## Store links

Until the app is published, the App Store and Google Play buttons read «Próximamente
en». Set either variable and that button becomes a link, with no code change:

- `NEXT_PUBLIC_APP_STORE_URL`
- `NEXT_PUBLIC_PLAY_STORE_URL`

## Tests

```bash
bun run test        # dictionaries, language negotiation, sitemap and waitlist rules
bun run test:e2e    # production build, routing and axe (WCAG 2.2 AA) on desktop and phone
```

## Deployment

Merging to `main` builds this app's image (served at `www.allfit.one` and `space.allfit.one`) and rolls it out on ECS, behind
CloudFront. See [`infra/README.md`](../../infra/README.md).
