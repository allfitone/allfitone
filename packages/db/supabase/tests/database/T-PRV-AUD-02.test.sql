-- T-PRV-AUD-02 — OP-SUP-009: the access log reaches every record, a page at a time.
--
-- `HU-BO-030`. `privacy.list_access_events` answered the newest fifty and nothing told
-- the auditor there were more, while the screen said «N accesos en total». An auditor
-- who answers "who looked at this person" from the first page answers wrong.
--
-- `privacy.page_access_events` pages by (occurred_at, id), newest first. The id is what
-- makes it exact: one read writes several records in a single instant, and a cursor on
-- time alone would skip or repeat them. What it withholds is compared row for row with
-- the list in `T-PRV-AUD-01`, which holds the break-glass cases.

begin;

select plan(9);

insert into identity.people (id, given_name, family_name, status)
values
  ('019a9100-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019a9100-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019a9100-0000-7000-8000-000000000003', 'Auditor', 'Gamma', 'active'),
  ('019a9100-0000-7000-8000-000000000004', 'Operator', 'Delta', 'active'),
  ('019a9100-0000-7000-8000-000000000005', 'Outsider', 'Epsilon', 'active'),
  ('019a9100-0000-7000-8000-000000000006', 'Subject', 'Zeta', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019a9100-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha91', null),
  ('019a9100-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta91', null),
  ('019a9100-0000-7000-8000-000000000013', 'workos', 'https://issuer.test', 'gamma91',
    '019a9100-0000-7000-8000-000000000003'),
  ('019a9100-0000-7000-8000-000000000015', 'workos', 'https://issuer.test', 'epsilon91',
    '019a9100-0000-7000-8000-000000000005');

select support.bootstrap_backoffice_administrators(
  '019a9100-0000-7000-8000-000000000001', 'alpha91',
  '019a9100-0000-7000-8000-000000000002', 'beta91',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-AUD-02'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values
  ('019a9100-0000-7000-8000-000000000021', '019a9100-0000-7000-8000-000000000011',
    'sid_alpha_91', 'backoffice', decode(repeat('b1', 32), 'hex'), 'v1.alpha91',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019a9100-0000-7000-8000-000000000023', '019a9100-0000-7000-8000-000000000013',
    'sid_gamma_91', 'backoffice', decode(repeat('b3', 32), 'hex'), 'v1.gamma91',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019a9100-0000-7000-8000-000000000025', '019a9100-0000-7000-8000-000000000015',
    'sid_epsilon_91', 'backoffice', decode(repeat('b5', 32), 'hex'), 'v1.epsilon91',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours');

select support.assign_platform_role(
  '019a9100-0000-7000-8000-000000000001', '019a9100-0000-7000-8000-000000000021',
  '019a9100-0000-7000-8000-000000000003', 'allfit_admin',
  '019a9100-0000-7000-8000-000000000101', '019a9100-0000-7000-8000-000000000201',
  decode(repeat('61', 32), 'hex')
);

-- Every admin holds every duty (ADR-046): the refusal left is a session without the role.
select throws_ok(
  $$ select * from privacy.page_access_events(
    '019a9100-0000-7000-8000-000000000005', '019a9100-0000-7000-8000-000000000025',
    null, null, null, null, 50, null, null
  ) $$,
  '42501',
  null,
  'a Backoffice session without the admin role cannot page the access log'
);

-- Converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019a9100-0000-7000-8000-000000000001', '019a9100-0000-7000-8000-000000000021',
  '019a9100-0000-7000-8000-000000000003', 'audit_platform_access',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-091',
  '019a9100-0000-7000-8000-000000000105', '019a9100-0000-7000-8000-000000000205',
  decode(repeat('65', 32), 'hex')
);

-- Five records: three written in the same instant, as one read writes them, and two
-- earlier. Their ids are fixed so the expected order is written down, not computed.
insert into privacy.access_events (
  id, actor_person_id, subject_person_id, resource, purpose, result, request_id,
  access_mode, occurred_at
)
select
  ('019a9100-0000-7000-8000-00000000050' || n)::uuid,
  '019a9100-0000-7000-8000-000000000004', '019a9100-0000-7000-8000-000000000006',
  'support.person_operational_state', 'customer_support_request', 'allowed',
  ('019a9100-0000-7000-8000-00000000060' || n)::uuid, 'organization_operational',
  case when n <= 3 then timestamptz '2026-10-01 12:00:00+00'
       else timestamptz '2026-10-01 12:00:00+00' - (n || ' hours')::interval end
from generate_series(1, 5) as n;

create temporary table pages (page integer, position integer, access_event_id uuid);

insert into pages
select 1, row_number() over (), row.access_event_id
from privacy.page_access_events(
  '019a9100-0000-7000-8000-000000000003', '019a9100-0000-7000-8000-000000000023',
  null, '019a9100-0000-7000-8000-000000000006', null, null, 2, null, null
) as row;

select results_eq(
  $$ select access_event_id from pages where page = 1 order by position $$,
  $$ values ('019a9100-0000-7000-8000-000000000503'::uuid),
            ('019a9100-0000-7000-8000-000000000502'::uuid) $$,
  'the first page is the newest, and a tie in time is ordered by the record'
);

insert into pages
select 2, row_number() over (), row.access_event_id
from privacy.page_access_events(
  '019a9100-0000-7000-8000-000000000003', '019a9100-0000-7000-8000-000000000023',
  null, '019a9100-0000-7000-8000-000000000006', null, null, 2,
  timestamptz '2026-10-01 12:00:00+00', '019a9100-0000-7000-8000-000000000502'
) as row;

select results_eq(
  $$ select access_event_id from pages where page = 2 order by position $$,
  $$ values ('019a9100-0000-7000-8000-000000000501'::uuid),
            ('019a9100-0000-7000-8000-000000000504'::uuid) $$,
  'the next page starts inside the same instant, after the last record read'
);

insert into pages
select 3, row_number() over (), row.access_event_id
from privacy.page_access_events(
  '019a9100-0000-7000-8000-000000000003', '019a9100-0000-7000-8000-000000000023',
  null, '019a9100-0000-7000-8000-000000000006', null, null, 2,
  timestamptz '2026-10-01 08:00:00+00', '019a9100-0000-7000-8000-000000000504'
) as row;

select ok(
  (select count(*) = 5 and count(distinct access_event_id) = 5 from pages),
  'paging reaches every record once: none skipped, none repeated'
);

select is(
  (select count(*)::integer from privacy.page_access_events(
     '019a9100-0000-7000-8000-000000000003', '019a9100-0000-7000-8000-000000000023',
     '019a9100-0000-7000-8000-000000000003', '019a9100-0000-7000-8000-000000000006',
     null, null, 2, timestamptz '2026-10-01 12:00:00+00',
     '019a9100-0000-7000-8000-000000000502'
   )),
  0,
  'a cursor narrows the filters, it never replaces them'
);

select throws_ok(
  $$ select * from privacy.page_access_events(
    '019a9100-0000-7000-8000-000000000003', '019a9100-0000-7000-8000-000000000023',
    null, null, null, null, 2, timestamptz '2026-10-01 12:00:00+00', null
  ) $$,
  '22023',
  null,
  'half a cursor is refused rather than read as the first page'
);

-- One more than the largest page the API serves, so it can tell whether another exists.
insert into privacy.access_events (
  actor_person_id, subject_person_id, resource, purpose, result, request_id,
  access_mode, occurred_at
)
select
  '019a9100-0000-7000-8000-000000000004', '019a9100-0000-7000-8000-000000000006',
  'support.person_operational_state', 'customer_support_request', 'allowed',
  gen_random_uuid(), 'organization_operational', timestamptz '2026-09-01 00:00:00+00'
from generate_series(1, 210);

select is(
  (select count(*)::integer from privacy.page_access_events(
     '019a9100-0000-7000-8000-000000000003', '019a9100-0000-7000-8000-000000000023',
     null, null, null, null, 500, null, null
   )),
  201,
  'a page is capped one above the largest the API asks for'
);

-- ---------------------------------------------------------------------------
-- Structure and grants
-- ---------------------------------------------------------------------------

select is(
  (select pg_get_function_result(p.oid)
   from pg_proc as p
   join pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'privacy' and p.proname = 'page_access_events'),
  'TABLE(access_event_id uuid, actor_person_id uuid, subject_person_id uuid, resource text,'
    || ' resource_id uuid, purpose text, result text, scope_code text, scope_version integer,'
    || ' access_mode privacy.access_mode, occurred_at timestamp with time zone)',
  'a page carries the record of the access and its id, and nothing that was read'
);

select ok(
  has_function_privilege(
    'allfit_api',
    'privacy.page_access_events(uuid,uuid,uuid,uuid,timestamptz,timestamptz,integer,timestamptz,uuid)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'public',
      'privacy.page_access_events(uuid,uuid,uuid,uuid,timestamptz,timestamptz,integer,timestamptz,uuid)',
      'EXECUTE'
    ),
  'the runtime role pages the log; nobody else does'
);

select * from finish();
rollback;
