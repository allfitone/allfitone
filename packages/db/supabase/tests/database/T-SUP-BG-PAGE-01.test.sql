-- T-SUP-BG-PAGE-01 — HU-BO-008: a window over her training reaches every session, not only
-- the newest hundred.
--
-- A training read answered the newest hundred sessions and nothing said there were more,
-- so a case about something older had no way to reach it. Now a read takes the last
-- session it already showed and answers the next hundred older than it, and says whether
-- older ones remain. Every page is its own read, logged before it answers like any other.
-- What she hid from a gym travels with the page it belongs to.

begin;

select plan(9);

insert into identity.people (id, given_name, family_name, status)
values
  ('019cd000-0000-7000-8000-000000000001', 'Admin', 'Uno', 'active'),
  ('019cd000-0000-7000-8000-000000000002', 'Admin', 'Dos', 'active'),
  ('019cd000-0000-7000-8000-000000000006', 'Sujeto', 'Constante', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019cd000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'page-uno', null),
  ('019cd000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'page-dos', null);

select support.bootstrap_backoffice_administrators(
  '019cd000-0000-7000-8000-000000000001', 'page-uno',
  '019cd000-0000-7000-8000-000000000002', 'page-dos',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-BG-PAGE-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values (
  '019cd000-0000-7000-8000-000000000021', '019cd000-0000-7000-8000-000000000011',
  'sid_page_uno', 'backoffice', decode(repeat('cd', 32), 'hex'), 'v1.page-uno',
  clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'
);

-- A hundred and two sessions of her own, one an hour, the newest an hour ago.
insert into execution.executed_sessions (
  id, person_id, activity_type_id, result_contract_id, contract_version,
  started_at, ended_at, timezone, requested_level, capture_source
)
select
  ('019cd000-0000-7000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '019cd000-0000-7000-8000-000000000006',
  '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
  clock_timestamp() - make_interval(hours => n),
  clock_timestamp() - make_interval(hours => n) + interval '30 minutes',
  'America/Bogota', 'summary', 'manual'
from generate_series(1, 102) as n;

-- The oldest session is hidden from a gym, so it belongs to the second page.
insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019cd000-0000-7000-8000-000000000101', 'gym', 'Gimnasio Pagina',
  '{"party_kind":"legal_entity","party_name":"Gimnasio Pagina","purpose":"studio_operations"}');
insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019cd000-0000-7000-8000-000000000301', '019cd000-0000-7000-8000-000000000006',
  '019cd000-0000-7000-8000-000000000101', 'active');
insert into privacy.session_visibility_denials (person_id, executed_session_id, relationship_id)
values ('019cd000-0000-7000-8000-000000000006', '019cd000-0000-7000-8000-000000000102',
  '019cd000-0000-7000-8000-000000000301');

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019cd000-0000-7000-8000-000000000001', true);

select support.request_break_glass(
  '019cd000-0000-7000-8000-000000000001', '019cd000-0000-7000-8000-000000000021',
  '019cd000-0000-7000-8000-000000000006', array['prior_training_history'],
  'customer_support_request', 'CASE-2026-800',
  'cd000000-0000-4000-8000-000000000001', '019cd000-0000-7000-8000-000000000501',
  decode(repeat('cd', 32), 'hex')
);

create temporary table first_page on commit drop as
select support.exercise_break_glass(
  '019cd000-0000-7000-8000-000000000001', '019cd000-0000-7000-8000-000000000021',
  (select id from support.break_glass_requests where case_reference = 'CASE-2026-800'),
  'prior_training_history', 'execution.executed_sessions', null, null, null
) as answer;

select is(
  (select jsonb_array_length(answer -> 'content' -> 'prior_training_history') from first_page),
  100,
  'the first read answers the newest hundred'
);

select is(
  (select (answer -> 'content' ->> 'has_older_sessions')::boolean from first_page),
  true,
  'and says older ones remain'
);

select is(
  (select jsonb_array_length(answer -> 'content' -> 'hidden_sessions') from first_page),
  0,
  'the hidden session is not on this page'
);

create temporary table second_page on commit drop as
select support.exercise_break_glass(
  '019cd000-0000-7000-8000-000000000001', '019cd000-0000-7000-8000-000000000021',
  (select id from support.break_glass_requests where case_reference = 'CASE-2026-800'),
  'prior_training_history', 'execution.executed_sessions', null,
  (select (answer -> 'content' -> 'prior_training_history' -> 99 ->> 'started_at')::timestamptz
   from first_page),
  (select (answer -> 'content' -> 'prior_training_history' -> 99 ->> 'id')::uuid from first_page)
) as answer;

select is(
  (select jsonb_array_length(answer -> 'content' -> 'prior_training_history') from second_page),
  2,
  'the next read, from the last session shown, answers the two older ones'
);

select is(
  (select (answer -> 'content' ->> 'has_older_sessions')::boolean from second_page),
  false,
  'and says nothing older remains'
);

select is(
  (select count(*)::integer
   from first_page, second_page,
     jsonb_array_elements(first_page.answer -> 'content' -> 'prior_training_history') as one,
     jsonb_array_elements(second_page.answer -> 'content' -> 'prior_training_history') as two
   where one ->> 'id' = two ->> 'id'),
  0,
  'no session is answered twice'
);

select is(
  (select answer -> 'content' -> 'hidden_sessions' -> 0 ->> 'executed_session_id' from second_page),
  '019cd000-0000-7000-8000-000000000102',
  'the hidden session travels with the page it is on'
);

select is(
  (select count(*)::integer from support.break_glass_events
   where request_id = (select id from support.break_glass_requests
                       where case_reference = 'CASE-2026-800')
     and result = 'allowed'),
  2,
  'each page is a read of its own, logged before it answers'
);

select throws_ok(
  $$ select support.exercise_break_glass(
       '019cd000-0000-7000-8000-000000000001', '019cd000-0000-7000-8000-000000000021',
       (select id from support.break_glass_requests where case_reference = 'CASE-2026-800'),
       'prior_training_history', 'execution.executed_sessions', null,
       clock_timestamp(), null
     ) $$,
  '22023',
  null,
  'a cursor is a session, both halves of it or neither'
);

select * from finish();

rollback;
