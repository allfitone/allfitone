-- T-IDN-BACKOFFICE-RESET-01 — a password reset closes the Backoffice sessions it predates
-- (`HU-BO-002` c4, `HU-BO-003` c3).
--
-- `identity.process_password_reset_succeeded` revokes every session of the account that
-- the reset predates, and for a Backoffice session queues its revocation with the
-- provider. The rule existed with no assertion on the Backoffice part; these are those
-- assertions. A session opened after the reset — with the new password — is left alone,
-- and the provider's retry of the same event revokes nothing twice.

begin;

select plan(5);

insert into identity.people (id, given_name, family_name, status)
values ('019ba000-0000-7000-8000-000000000001', 'Operator', 'Reset', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values ('019ba000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'reset_op',
  '019ba000-0000-7000-8000-000000000001');

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at, created_at
) values
  -- Opened before the reset, with the old password.
  ('019ba000-0000-7000-8000-000000000021', '019ba000-0000-7000-8000-000000000011',
    'sid_reset_old', 'backoffice', decode(repeat('b1', 32), 'hex'), 'v1.old',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp() - interval '1 hour', clock_timestamp(), clock_timestamp() + interval '7 hours',
    clock_timestamp() - interval '1 hour'),
  -- Opened after it, with the new one.
  ('019ba000-0000-7000-8000-000000000022', '019ba000-0000-7000-8000-000000000011',
    'sid_reset_new', 'backoffice', decode(repeat('b2', 32), 'hex'), 'v1.new',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours',
    clock_timestamp());

create temporary table reset_answer as
select * from identity.process_password_reset_succeeded(
  'workos', 'https://issuer.test', 'evt_reset_bo_1', 'reset_op',
  clock_timestamp() - interval '10 minutes'
);

select is(
  (select outcome || ':' || revoked_session_count from reset_answer),
  'processed:1',
  'the reset is processed and closes the one session it predates'
);

select ok(
  (select revoked_at is not null from identity.access_sessions
    where id = '019ba000-0000-7000-8000-000000000021'),
  'the Backoffice session opened with the old password is revoked'
);

select is(
  (select count(*)::integer from system.outbox_events
    where event_type = 'identity.backoffice_session_revocation_requested.v1'
      and aggregate_id = '019ba000-0000-7000-8000-000000000021'),
  1,
  'and its revocation with the provider is queued'
);

select ok(
  (select revoked_at is null from identity.access_sessions
    where id = '019ba000-0000-7000-8000-000000000022'),
  'a session opened after the reset, with the new password, stays open'
);

select is(
  (select replayed::text || ':' || (
     select count(*) from system.outbox_events
     where event_type = 'identity.backoffice_session_revocation_requested.v1'
       and aggregate_id = '019ba000-0000-7000-8000-000000000021'
   )
   from identity.process_password_reset_succeeded(
     'workos', 'https://issuer.test', 'evt_reset_bo_1', 'reset_op',
     clock_timestamp() - interval '10 minutes'
   )),
  'true:1',
  'the provider retrying the same event revokes nothing twice'
);

select * from finish();

rollback;
