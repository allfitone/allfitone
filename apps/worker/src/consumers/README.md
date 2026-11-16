# Consumers

One per outbox event. Each one unpacks, calls the use case, acknowledges.

They must be **idempotent**: delivery is at-least-once, so the same message can
arrive twice.

The consumers live one level up, in `src/`, beside the jobs that run them.
`contact-change` is `src/email-change.ts`: it calls the provider's email update,
then promotes the pending email to effective. If the provider refuses, the request
fails; the effective email never moved.

`password-change` is `src/password-change.ts`: the API already set the password in
WorkOS (ADR-051), so it closes every other session, keeping the one the change came
from, and then emails a notice. It never sees a password.
