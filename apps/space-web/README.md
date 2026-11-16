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
link opens (`?ref=CODE`); the landing also carries the form in its `#waitlist`
section. The API's waitlist operations (OP-WL-001 to OP-WL-005, ADR-050) are
reached only through this app's server: the browser posts to
`/api/waitlist/<operation>` (`signups`, `email-requests`, `confirmations`,
`link-reads`, `departures`), and `src/lib/waitlist-relay.ts` forwards the
request to `NEXT_PUBLIC_API_URL` with what only the server has:

- `WAITLIST_SPACE_WEB_SECRET`, a runtime secret of the ECS task. Without it the
  API answers 404 to every waitlist route, and the relay answers 503 without
  asking.
- The visitor's address, read from `X-Forwarded-For`: behind CloudFront it is the
  second entry from the right (CloudFront appends the visitor, the load balancer
  appends CloudFront). Entries further left are the visitor's own and never read.
- The device: a random identifier in the `allfit_space_device` cookie
  (HttpOnly, Secure, SameSite=Lax), which the API stores only as a keyed hash.

The waitlist emails link to three pages, each with its token in the fragment
(`#token=…`), so it never reaches a server log or a `Referer`:

| Page                         | What it does                                              |
| ---------------------------- | --------------------------------------------------------- |
| `/{lang}/waitlist/confirm`   | Confirms the email as soon as it opens                    |
| `/{lang}/waitlist/referrals` | «Mi link»: the code, the link and the referral count      |
| `/{lang}/waitlist/leave`     | Asks first, then deletes the sign-up; it cannot be undone |

The page reads the token, takes it off the address bar and keeps it in session
storage for the tab. A link the API does not recognise shows one message
whatever the reason, with a form to ask for the email again. The three pages are
`noindex` and send `Referrer-Policy: no-referrer`.

The e2e suite answers `/api/waitlist/*` in the browser, so it never needs the
API; `src/lib/waitlist-relay.test.ts` covers the relay itself.

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
