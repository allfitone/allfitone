-- T-IDN-NOTICES-04 — an email speaks the language she chose (ADR-054 decision 8). TECH-44.
--
-- The worker asks the database which language an event's email is written in. When the
-- event names a person, it is her `locale`; with no choice, or no person behind the event
-- (an invitation to an address nobody holds yet), it is Spanish. The code that confirms a
-- new email is hers like the change it confirms. Only the worker asks, and the language is
-- read through the recipient's scope, which shows nobody else's preferences.
--
-- Written before the migration and watched failing.
begin;

select plan(13);

set local session_replication_role = replica;

insert into identity.people (id, given_name, family_name, contact_email, contact_email_verified_at, status)
values ('019f8900-0000-7000-8000-000000000001', 'Ana', 'Lengua', 'ana.lengua@example.test', clock_timestamp(), 'active'),
       ('019f8900-0000-7000-8000-000000000002', 'Bea', 'Lengua', null, null, 'active'),
       ('019f8900-0000-7000-8000-000000000003', 'Camilo', 'Coach', null, null, 'active'),
       ('019f8900-0000-7000-8000-000000000004', 'Dora', 'Lengua', null, null, 'active');
insert into identity.access_accounts (id, provider, issuer, subject, person_id, linked_at)
values ('019f8900-0000-7000-8000-000000000301', 'workos', 'https://issuer.test', 'user_ana_lengua',
        '019f8900-0000-7000-8000-000000000001', clock_timestamp());

-- Ana chose English; Dora chose only her units; Bea chose nothing.
insert into identity.person_preferences (person_id, mass_unit, locale)
values ('019f8900-0000-7000-8000-000000000001', null, 'en'),
       ('019f8900-0000-7000-8000-000000000004', 'kg', null);

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019f8900-0000-7000-8000-000000000101', 'gym', 'Gym Lengua',
  '{"party_kind":"legal_entity","party_name":"Gym Lengua SAS","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id, status)
values ('019f8900-0000-7000-8000-000000000203', '019f8900-0000-7000-8000-000000000101', '019f8900-0000-7000-8000-000000000003', 'active');

insert into identity.password_changes (id, person_id, access_account_id, outcome, keep_session_id)
values ('019f8900-0000-7000-8000-000000000d01', '019f8900-0000-7000-8000-000000000001',
        '019f8900-0000-7000-8000-000000000301', 'changed', 'session_kept');

insert into identity.identity_action_requests (
  id, person_id, access_account_id, action_kind, initiated_by_kind, initiated_by_person_id,
  delivery_channel, contact_fingerprint, contact_hint, expires_at, proposed_email
) values ('019f8900-0000-7000-8000-000000000e01', '019f8900-0000-7000-8000-000000000001',
  '019f8900-0000-7000-8000-000000000301', 'email_change', 'person', '019f8900-0000-7000-8000-000000000001',
  'email', extensions.digest('new.lengua@example.test', 'sha256'), 'n***@example.test',
  clock_timestamp() + interval '1 hour', 'new.lengua@example.test');

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values
  ('019f8900-0000-7000-8000-000000000401', '019f8900-0000-7000-8000-000000000101',
   '019f8900-0000-7000-8000-000000000203', 'email', 'ana.lengua@example.test',
   extensions.digest('l-token-1', 'sha256'), 1, extensions.digest('l-proposal-1', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym Lengua SAS","purpose":"studio_operations"}',
   'pending', clock_timestamp() + interval '7 days'),
  ('019f8900-0000-7000-8000-000000000402', '019f8900-0000-7000-8000-000000000101',
   '019f8900-0000-7000-8000-000000000203', 'email', 'nobody.yet@example.test',
   extensions.digest('l-token-2', 'sha256'), 1, extensions.digest('l-proposal-2', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym Lengua SAS","purpose":"studio_operations"}',
   'pending', clock_timestamp() + interval '7 days');
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f8900-0000-7000-8000-000000000501', '019f8900-0000-7000-8000-000000000401', 'service_relationship', 'pending', null),
       ('019f8900-0000-7000-8000-000000000502', '019f8900-0000-7000-8000-000000000402', 'service_relationship', 'pending', null);

set local session_replication_role = origin;

create function pg_temp.raise(p_type text, p_aggregate uuid, p_payload jsonb) returns uuid
language sql as $fn$
  select system.enqueue_outbox_event(split_part(p_type, '.', 1), p_aggregate, p_type, p_payload)
$fn$;

create temporary table raised (label text primary key, event_id uuid);
grant select on raised to allfit_api;

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8900-0000-7000-8000-000000000003', true);

insert into raised values
  ('invited', pg_temp.raise('relationship.client_invited.v1', '019f8900-0000-7000-8000-000000000401',
     '{"invitation_id": "019f8900-0000-7000-8000-000000000401"}')),
  ('stranger', pg_temp.raise('relationship.client_invited.v1', '019f8900-0000-7000-8000-000000000402',
     '{"invitation_id": "019f8900-0000-7000-8000-000000000402"}')),
  ('paused', pg_temp.raise('payments.subscription_suspended.v1', '019f8900-0000-7000-8000-000000000a01',
     '{"subscription_id": "019f8900-0000-7000-8000-000000000a01", "person_id": "019f8900-0000-7000-8000-000000000001", "organization_id": "019f8900-0000-7000-8000-000000000101"}')),
  ('reassigned', pg_temp.raise('relationship.professional_reassigned.v1', '019f8900-0000-7000-8000-000000000b01',
     '{"assignment_id": "019f8900-0000-7000-8000-000000000b01", "person_id": "019f8900-0000-7000-8000-000000000002", "organization_id": "019f8900-0000-7000-8000-000000000101"}')),
  ('units-only', pg_temp.raise('relationship.professional_reassigned.v1', '019f8900-0000-7000-8000-000000000b02',
     '{"assignment_id": "019f8900-0000-7000-8000-000000000b02", "person_id": "019f8900-0000-7000-8000-000000000004", "organization_id": "019f8900-0000-7000-8000-000000000101"}'));

select set_config('app.actor_person_id', '019f8900-0000-7000-8000-000000000001', true);
insert into raised values
  ('password', pg_temp.raise('identity.password_changed.v1', '019f8900-0000-7000-8000-000000000d01',
     '{"change_id": "019f8900-0000-7000-8000-000000000d01"}')),
  ('code', pg_temp.raise('identity.contact_changed.v1', '019f8900-0000-7000-8000-000000000e01',
     '{"request_id": "019f8900-0000-7000-8000-000000000e01"}')),
  ('confirmed', pg_temp.raise('identity.contact_verified.v1', '019f8900-0000-7000-8000-000000000e01',
     '{"request_id": "019f8900-0000-7000-8000-000000000e01"}'));

create function pg_temp.locale_of(p_label text) returns text
language sql as $fn$
  select identity.email_locale_for_event((select event_id from raised where label = p_label))
$fn$;

-- ———————————————————————————————— the worker asks, as the runtime role

set local role allfit_api;
select set_config('app.actor_kind', 'worker', true);
select set_config('app.actor_person_id', '', true);

select is(pg_temp.locale_of('invited'), 'en',
  'T-IDN-INT-96 an invitation to the address she verified is written in the language she chose');
select is(pg_temp.locale_of('paused'), 'en',
  'T-IDN-INT-96 so is the notice that her plan was paused');
select is(pg_temp.locale_of('password'), 'en',
  'T-IDN-INT-96 and the notice that her password changed');
select is(pg_temp.locale_of('confirmed'), 'en',
  'T-IDN-INT-96 and the notice that her email changed');
select is(pg_temp.locale_of('code'), 'en',
  'T-IDN-INT-96 and the code that confirms her new email, which is hers like the change');
select is(pg_temp.locale_of('reassigned'), 'es',
  'T-IDN-INT-96 a person who chose nothing reads Spanish');
select is(pg_temp.locale_of('units-only'), 'es',
  'T-IDN-INT-96 so does one who chose only her units');
select is(pg_temp.locale_of('stranger'), 'es',
  'T-IDN-INT-96 an invitation to an address no person holds yet is Spanish');
select is(identity.email_locale_for_event(gen_random_uuid()), 'es',
  'T-IDN-INT-96 and so is an event nobody raised');

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8900-0000-7000-8000-000000000001', true);
select throws_ok(
  format($$ select identity.email_locale_for_event(%L) $$, (select event_id from raised where label = 'password')),
  '42501', null, 'T-IDN-RLS-47 only the worker asks which language an email is written in');
reset role;

-- ———————————————————————————————— her scope shows only her preferences

select set_config('app.actor_kind', 'worker', true);
select set_config('app.actor_person_id', '', true);
select access_control.open_contract_scope('notice_recipient', '019f8900-0000-7000-8000-000000000001');
set local role allfit_owner;
select is(
  (select array_agg(person_id::text order by person_id) from identity.person_preferences
   where person_id in ('019f8900-0000-7000-8000-000000000001', '019f8900-0000-7000-8000-000000000004')),
  array['019f8900-0000-7000-8000-000000000001'],
  'T-IDN-RLS-48 writing to her shows her language, and nobody else''s');
reset role;

select access_control.close_contract_scope();
set local role allfit_owner;
select is(
  (select count(*)::integer from identity.person_preferences
   where person_id = '019f8900-0000-7000-8000-000000000001'),
  0, 'T-IDN-RLS-48 with no scope open, nobody''s');
reset role;

set local role allfit_api;
select throws_ok(
  $$ select locale from identity.person_preferences $$,
  '42501', null, 'T-IDN-RLS-48 and the runtime role reads no preference directly');
reset role;

select * from finish();
rollback;
