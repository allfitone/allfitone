# Allfit Studio — web

Next.js client for `/studio/v1`, deployed independently from the other apps in
the monorepo.

## Local development

From the repository root:

```bash
bun run dev --filter=@allfitone/studio-web
```

The app runs at `http://localhost:3000` and reads the API origin from
`NEXT_PUBLIC_API_URL`.

## Deployment

Merging to `main` builds this app's image and rolls it out on ECS, behind
CloudFront. See [`infra/README.md`](../../infra/README.md).

Studio uses hosted login. The organization travels explicitly in the path under
`/organizations/{orgId}`; it is never resolved from the token or a stored
preference.

## Server-state cache

Studio uses TanStack Query for authenticated business reads and mutations. The
cache exists only in memory, is cleared on logout or an API `401`, and never
contains invitation tokens. Session recovery, entry context, onboarding, and
organization authorization remain outside the query cache because they are
security state machines rather than reusable presentation data.

Catalog responses retain their existing ETag-backed `sessionStorage` cache.
Organization and profile data are never persisted by TanStack Query.

A read whose operation answers `private-no-store` is not cached at all — not
even in memory for the length of a visit. Those query options set both
`staleTime: 0` and `gcTime: 0`, so leaving the screen drops the answer and
coming back asks again instead of painting the old one while the new one
travels. The client card (`OP-REL-019`) is the first of these: it decides which
categories of a person's data appear at all, so a remembered copy would put
back a category she revoked seconds ago. The cost is a loading state on every
arrival, which for an index of what somebody authorized is the right way round.

A read of the person's own data goes further and turns the automatic refetches
off as well (`refetchOnWindowFocus: false`, `refetchOnReconnect: false`). Those
reads are recorded inside the transaction that answers them and shown to her, so
leaving the tab and coming back would write her an access the professional never
asked for — a log of the window's focus rather than of anybody's intent. The
authorized training profile (`OP-IDN-018`) is the first of these; the same
applies to every `clients/{personId}/…` read that follows it.
