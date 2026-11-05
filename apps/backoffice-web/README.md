# Allfit Backoffice — web

Next.js client for `/backoffice/v1`, deployed independently from the other apps
in the monorepo.

## Local development

From the repository root:

```bash
bun run dev --filter=@allfitone/backoffice-web
```

The app runs at `http://localhost:3001` and reads the API origin from
`NEXT_PUBLIC_API_URL`.

## Deployment

Merging to `main` builds this app's image and rolls it out on ECS, behind
CloudFront. See [`infra/README.md`](../../infra/README.md).

Backoffice authenticates directly against `/backoffice/v1` with email, password
and TOTP. Hosted AuthKit is used only for the password-reset page reached from the
email sent by WorkOS; it is not the login surface.

The browser stores no email, password, TOTP secret, QR or provider identifier.
Only minimal session timing state is synchronized between tabs. A successful
login proves AAL2 for that session but grants no operation by itself; future
screens must still check their platform duty in the backend transaction.

## Verification

```bash
bun run --filter=@allfitone/backoffice-web test
bun run --filter=@allfitone/backoffice-web lint
bun run --filter=@allfitone/backoffice-web typecheck
bun run --filter=@allfitone/backoffice-web build
bun run --filter=@allfitone/backoffice-web test:e2e
```
