-- T-SUP-BG-HIDDEN-01 — HU-BO-008 criterion 4: a window over her training sees what she
-- hid from a gym, and from which gym.
--
-- She hides a session she trained alone from one relationship (`HU-SP-032`,
-- `privacy.hide_session`). A coach of that gym never learns it was hidden, so the
-- session projection Studio and Space share stays as it is. The window reads the hiding
-- beside the sessions, as `hidden_sessions`: session, relationship and the gym's name.
--
-- Two policies let a live window's reader see the denials and the relationships they
-- name, and nobody else: an administrator with no window over her sees neither.

begin;

select plan(10);

insert into identity.people (id, given_name, family_name, status)
values
  ('019c7000-0000-7000-8000-000000000001', 'Admin', 'Uno', 'active'),
  ('019c7000-0000-7000-8000-000000000002', 'Admin', 'Dos', 'active'),
  ('019c7000-0000-7000-8000-000000000006', 'Sujeto', 'Oculta', 'active'),
  ('019c7000-0000-7000-8000-000000000008', 'Owner', 'Gym', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019c7000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'hidden-uno', null),
  ('019c7000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'hidden-dos', null);

select support.bootstrap_backoffice_administrators(
  '019c7000-0000-7000-8000-000000000001', 'hidden-uno',
  '019c7000-0000-7000-8000-000000000002', 'hidden-dos',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-BG-HIDDEN-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values (
  '019c7000-0000-7000-8000-000000000021', '019c7000-0000-7000-8000-000000000011',
  'sid_hidden_uno', 'backoffice', decode(repeat('c7', 32), 'hex'), 'v1.hidden-uno',
  clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'
);

-- Two gyms she has trained with.
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019c7000-0000-7000-8000-000000000101', 'gym', 'Gimnasio Uno',
    '{"party_kind":"legal_entity","party_name":"Gimnasio Uno","purpose":"studio_operations"}'),
  ('019c7000-0000-7000-8000-000000000102', 'gym', 'Gimnasio Dos',
    '{"party_kind":"legal_entity","party_name":"Gimnasio Dos","purpose":"studio_operations"}');
insert into relationships.service_relationships (id, person_id, organization_id, status)
values
  ('019c7000-0000-7000-8000-000000000301', '019c7000-0000-7000-8000-000000000006',
    '019c7000-0000-7000-8000-000000000101', 'active'),
  ('019c7000-0000-7000-8000-000000000302', '019c7000-0000-7000-8000-000000000006',
    '019c7000-0000-7000-8000-000000000102', 'active');

-- Two sessions of her own: the first hidden from Gimnasio Uno, the second hidden from
-- Gimnasio Dos and shared again.
insert into execution.executed_sessions (
  id, person_id, activity_type_id, result_contract_id, contract_version,
  started_at, ended_at, timezone, requested_level, capture_source
) values
  ('019c7000-0000-7000-8000-000000000901', '019c7000-0000-7000-8000-000000000006',
    '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
    clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days' + interval '1 hour',
    'America/Bogota', 'summary', 'manual'),
  ('019c7000-0000-7000-8000-000000000902', '019c7000-0000-7000-8000-000000000006',
    '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
    clock_timestamp() - interval '1 day', clock_timestamp() - interval '1 day' + interval '1 hour',
    'America/Bogota', 'summary', 'manual');

insert into privacy.session_visibility_denials (
  id, person_id, executed_session_id, relationship_id, status, restored_at
) values
  ('019c7000-0000-7000-8000-000000000401', '019c7000-0000-7000-8000-000000000006',
    '019c7000-0000-7000-8000-000000000901', '019c7000-0000-7000-8000-000000000301',
    'active', null),
  ('019c7000-0000-7000-8000-000000000402', '019c7000-0000-7000-8000-000000000006',
    '019c7000-0000-7000-8000-000000000902', '019c7000-0000-7000-8000-000000000302',
    'reverted', clock_timestamp());

-- A standard window over her own training, open once asked for (ADR-046).
select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019c7000-0000-7000-8000-000000000001', true);

select support.request_break_glass(
  '019c7000-0000-7000-8000-000000000001', '019c7000-0000-7000-8000-000000000021',
  '019c7000-0000-7000-8000-000000000006', array['prior_training_history'],
  'customer_support_request', 'CASE-2026-700',
  'c7000000-0000-4000-8000-000000000001', '019c7000-0000-7000-8000-000000000501',
  decode(repeat('a7', 32), 'hex')
);

create temporary table own_read on commit drop as
select support.exercise_break_glass(
  '019c7000-0000-7000-8000-000000000001', '019c7000-0000-7000-8000-000000000021',
  (select id from support.break_glass_requests where case_reference = 'CASE-2026-700'),
  'prior_training_history', 'execution.executed_sessions', null
) as answer;

select is(
  (select answer ->> 'outcome' from own_read),
  'allowed',
  'the window reads her training'
);

select is(
  (select jsonb_array_length(answer -> 'content' -> 'hidden_sessions') from own_read),
  1,
  'one session is hidden; one shared again is not listed'
);

select is(
  (select answer -> 'content' -> 'hidden_sessions' -> 0 ->> 'executed_session_id' from own_read),
  '019c7000-0000-7000-8000-000000000901',
  'the hidden session is named'
);

select is(
  (select answer -> 'content' -> 'hidden_sessions' -> 0 ->> 'organization_name' from own_read),
  'Gimnasio Uno',
  'and the gym it is hidden from, by name'
);

select is(
  (select answer -> 'content' -> 'hidden_sessions' -> 0 ->> 'relationship_id' from own_read),
  '019c7000-0000-7000-8000-000000000301',
  'and the relationship it is hidden from'
);

select ok(
  (select jsonb_array_length(answer -> 'content' -> 'prior_training_history') = 2
     and not ((answer -> 'content' -> 'prior_training_history' -> 0) ? 'hidden_from')
   from own_read),
  'the session projection Studio and Space share is unchanged'
);

-- The policies, from the reader's side: the requester sees the denials and the
-- relationship they name; the other administrator, with no window over her, sees neither.
set local role allfit_owner;

select is(
  (select count(*) from privacy.session_visibility_denials
   where person_id = '019c7000-0000-7000-8000-000000000006'),
  2::bigint,
  'a live window lets its reader see what she hid'
);

select is(
  (select count(*) from relationships.service_relationships
   where id = '019c7000-0000-7000-8000-000000000301'),
  1::bigint,
  'and the relationship it is hidden from'
);

select set_config('app.actor_person_id', '019c7000-0000-7000-8000-000000000002', true);

select is(
  (select count(*) from privacy.session_visibility_denials
   where person_id = '019c7000-0000-7000-8000-000000000006'),
  0::bigint,
  'an administrator with no window over her sees none of what she hid'
);

select is(
  (select count(*) from relationships.service_relationships
   where id = '019c7000-0000-7000-8000-000000000301'),
  0::bigint,
  'nor the relationship'
);

reset role;

select * from finish();

rollback;
