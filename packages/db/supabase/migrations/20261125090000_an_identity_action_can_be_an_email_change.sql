-- An identity action can be an email change — TECH-44, `OP-IDN-021`, `OP-IDN-022`.
--
-- Two enum values and nothing else, in a migration of their own: PostgreSQL refuses to use
-- a value added by `alter type … add value` inside the transaction that added it, and the
-- next migration needs both in checks, an index and functions.
--
-- `email_change` is the request a person opens from Space to change the address she signs
-- in with. `applying` is the state between her right code and WorkOS's answer: the code
-- proved the mailbox, the provider has not taken the address yet, and nothing in
-- `identity.people` has moved.

set lock_timeout = '5s';
set statement_timeout = '60s';

alter type identity.identity_action_kind add value if not exists 'email_change';
alter type identity.identity_action_status add value if not exists 'applying'
  after 'awaiting_verification';
