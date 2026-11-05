-- T-ORG-ACTOR-01 — who on Allfit's team did it (`HU-BO-014` c7, `HU-BO-015` c3,
-- `HU-BO-016` c8, `HU-BO-034` c3).
--
-- **The record already kept the person; the screen only said when.** Suspending,
-- reactivating, setting the quota, creating and cancelling a gym each store the acting
-- person and their duty. The projections returned an identifier at most, and the
-- handover not even that, so an audit months later could not answer "who".
--
-- **A name, and only a team member's.** The projections resolve the actor's display name
-- through one helper that answers for people who hold or held a platform role and for
-- nobody else, so it can never become a way to read a client's name.
--
-- **The quota keeps its history.** Criterion 3 asks for who, when and the previous value
-- of every change, not only of the last one.

begin;

select plan(19);

insert into identity.people (id, given_name, family_name, status, contact_email)
values
  ('019b1000-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active', null),
  ('019b1000-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active', null),
  ('019b1000-0000-7000-8000-000000000003', 'Lucía', 'Comercial', 'active', null),
  ('019b1000-0000-7000-8000-000000000004', 'Mateo', 'Ciclo', 'active', null),
  ('019b1000-0000-7000-8000-000000000005', 'Owner', 'Zeta', 'active', 'owner.zeta@actor.test'),
  ('019b1000-0000-7000-8000-000000000006', 'Sara', 'Ciclo', 'active', null),
  ('019b1000-0000-7000-8000-000000000007', 'Pablo', 'Comercial', 'active', null);

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019b1000-0000-7000-8000-000000000021', 'workos', 'https://issuer.test', 'alphaact', null),
  ('019b1000-0000-7000-8000-000000000022', 'workos', 'https://issuer.test', 'betaact', null),
  ('019b1000-0000-7000-8000-000000000023', 'workos', 'https://issuer.test', 'luciaact',
    '019b1000-0000-7000-8000-000000000003'),
  ('019b1000-0000-7000-8000-000000000024', 'workos', 'https://issuer.test', 'mateoact',
    '019b1000-0000-7000-8000-000000000004'),
  ('019b1000-0000-7000-8000-000000000026', 'workos', 'https://issuer.test', 'saraact',
    '019b1000-0000-7000-8000-000000000006'),
  ('019b1000-0000-7000-8000-000000000027', 'workos', 'https://issuer.test', 'pabloact',
    '019b1000-0000-7000-8000-000000000007');

select support.bootstrap_backoffice_administrators(
  '019b1000-0000-7000-8000-000000000001', 'alphaact',
  '019b1000-0000-7000-8000-000000000002', 'betaact',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-ORG-ACTOR-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at, revoked_at
)
select session_id, account_id, 'sid_' || session_id::text, 'backoffice',
       decode(repeat(hash_byte, 32), 'hex'), 'v1.actor',
       clock_timestamp() + interval '5 minutes', 2, 'password_totp',
       clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours', null
from (values
  ('019b1000-0000-7000-8000-000000000041'::uuid, '019b1000-0000-7000-8000-000000000021'::uuid, 'c1'),
  ('019b1000-0000-7000-8000-000000000043'::uuid, '019b1000-0000-7000-8000-000000000023'::uuid, 'c3'),
  ('019b1000-0000-7000-8000-000000000044'::uuid, '019b1000-0000-7000-8000-000000000024'::uuid, 'c4'),
  ('019b1000-0000-7000-8000-000000000046'::uuid, '019b1000-0000-7000-8000-000000000026'::uuid, 'c6'),
  ('019b1000-0000-7000-8000-000000000047'::uuid, '019b1000-0000-7000-8000-000000000027'::uuid, 'c7')
) as session_row(session_id, account_id, hash_byte);

select support.assign_platform_role(
  '019b1000-0000-7000-8000-000000000001', '019b1000-0000-7000-8000-000000000041',
  person_id, 'allfit_admin', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019b1000-0000-7000-8000-000000000003'::uuid, '019b1000-0000-7000-8000-000000000103'::uuid,
    '019b1000-0000-7000-8000-000000000203'::uuid, 'd3'),
  ('019b1000-0000-7000-8000-000000000004'::uuid, '019b1000-0000-7000-8000-000000000104'::uuid,
    '019b1000-0000-7000-8000-000000000204'::uuid, 'd4'),
  ('019b1000-0000-7000-8000-000000000006'::uuid, '019b1000-0000-7000-8000-000000000106'::uuid,
    '019b1000-0000-7000-8000-000000000206'::uuid, 'd6'),
  ('019b1000-0000-7000-8000-000000000007'::uuid, '019b1000-0000-7000-8000-000000000107'::uuid,
    '019b1000-0000-7000-8000-000000000207'::uuid, 'd7')
) as grant_row(person_id, key, command, hash_byte);

select support.assign_platform_duty(
  '019b1000-0000-7000-8000-000000000001', '019b1000-0000-7000-8000-000000000041',
  person_id, duty_code, clock_timestamp(), clock_timestamp() + interval '30 days',
  'CASE-2026-ACTOR', key, command, decode(repeat(hash_byte, 32), 'hex')
)
from (values
  ('019b1000-0000-7000-8000-000000000003'::uuid, 'manage_platform_commercial',
    '019b1000-0000-7000-8000-000000000113'::uuid, '019b1000-0000-7000-8000-000000000213'::uuid, 'e3'),
  ('019b1000-0000-7000-8000-000000000004'::uuid, 'manage_organization_lifecycle',
    '019b1000-0000-7000-8000-000000000114'::uuid, '019b1000-0000-7000-8000-000000000214'::uuid, 'e4'),
  ('019b1000-0000-7000-8000-000000000006'::uuid, 'manage_organization_lifecycle',
    '019b1000-0000-7000-8000-000000000116'::uuid, '019b1000-0000-7000-8000-000000000216'::uuid, 'e6'),
  ('019b1000-0000-7000-8000-000000000007'::uuid, 'manage_platform_commercial',
    '019b1000-0000-7000-8000-000000000117'::uuid, '019b1000-0000-7000-8000-000000000217'::uuid, 'e7')
) as duty_row(person_id, duty_code, key, command, hash_byte);

insert into organizations.organizations (
  id, type_code, display_name, legal_name, responsible_party
) values
  ('019b1000-0000-7000-8000-000000000301', 'gym', 'Gimnasio Auditado', 'Auditado SAS',
    '{"party_kind":"legal_entity","party_name":"Auditado SAS","purpose":"studio_operations"}'::jsonb);

-- ---------------------------------------------------------------------------
-- Who stopped it and who brought it back (HU-BO-016 c8)
-- ---------------------------------------------------------------------------

select * from organizations.suspend_organization(
  '019b1000-0000-7000-8000-000000000004', '019b1000-0000-7000-8000-000000000044',
  '019b1000-0000-7000-8000-000000000301', 'nonpayment',
  'a0000001-0000-4000-8000-000000000001', '019b1000-0000-7000-8000-000000000501',
  decode(repeat('b1', 32), 'hex')
);

select is(
  organizations.organization_suspension_projection('019b1000-0000-7000-8000-000000000301')
    #>> '{current,started_by_name}',
  'Mateo Ciclo',
  'the open suspension names who stopped the gym'
);

select * from organizations.reactivate_organization(
  '019b1000-0000-7000-8000-000000000006', '019b1000-0000-7000-8000-000000000046',
  '019b1000-0000-7000-8000-000000000301',
  'a0000002-0000-4000-8000-000000000002', '019b1000-0000-7000-8000-000000000502',
  decode(repeat('b2', 32), 'hex')
);

select is(
  organizations.organization_suspension_projection('019b1000-0000-7000-8000-000000000301')
    #>> '{history,0,started_by_name}',
  'Mateo Ciclo',
  'the closed period still names who stopped the gym'
);

select is(
  organizations.organization_suspension_projection('019b1000-0000-7000-8000-000000000301')
    #>> '{history,0,ended_by_name}',
  'Sara Ciclo',
  'and who brought it back, a different person'
);

-- ---------------------------------------------------------------------------
-- Every quota change: who, when and the value it replaced (HU-BO-034 c3)
-- ---------------------------------------------------------------------------

-- The quota command checks that it acts for the transaction actor.
select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b1000-0000-7000-8000-000000000003', true);

select organizations.set_organization_guest_quota(
  '019b1000-0000-7000-8000-000000000003', '019b1000-0000-7000-8000-000000000043',
  '019b1000-0000-7000-8000-000000000301', 50,
  'a0000003-0000-4000-8000-000000000003', '019b1000-0000-7000-8000-000000000503',
  decode(repeat('b3', 32), 'hex')
);

select set_config('app.actor_person_id', '019b1000-0000-7000-8000-000000000007', true);

select organizations.set_organization_guest_quota(
  '019b1000-0000-7000-8000-000000000007', '019b1000-0000-7000-8000-000000000047',
  '019b1000-0000-7000-8000-000000000301', 30,
  'a0000004-0000-4000-8000-000000000004', '019b1000-0000-7000-8000-000000000504',
  decode(repeat('b4', 32), 'hex')
);

create temporary table quota_read on commit drop as
select organizations.guest_quota_projection('019b1000-0000-7000-8000-000000000301') as quota;

select is(
  (select quota #>> '{last_change,by_name}' from quota_read),
  'Pablo Comercial',
  'the last change names who made it'
);

select is(
  (select jsonb_array_length(quota->'history') from quota_read),
  2,
  'every change is kept, not only the last'
);

select is(
  (select (quota->'history'->0) - 'at' - 'by_person_id' from quota_read),
  '{"seats": 30, "previous_seats": 50, "by_name": "Pablo Comercial"}'::jsonb,
  'newest first: the cut from 50 to 30, by whom'
);

select is(
  (select (quota->'history'->1) - 'at' - 'by_person_id' from quota_read),
  '{"seats": 50, "previous_seats": null, "by_name": "Lucía Comercial"}'::jsonb,
  'and the first number, which replaced no limit'
);

select is(
  (select (quota #>> '{history,1,by_person_id}')::uuid from quota_read),
  '019b1000-0000-7000-8000-000000000003'::uuid,
  'each change keeps the person, not only the name'
);

select ok(
  (select (quota #>> '{history,0,at}')::timestamptz >= (quota #>> '{history,1,at}')::timestamptz
   from quota_read),
  'and when it happened'
);

-- ---------------------------------------------------------------------------
-- Who created a gym, and who cancelled it (HU-BO-014 c7, HU-BO-015 c3)
-- ---------------------------------------------------------------------------

create temporary table handover_sur on commit drop as
select result
from organizations.create_unclaimed_organization(
  '019b1000-0000-7000-8000-000000000004', '019b1000-0000-7000-8000-000000000044',
  'Entrega Sur', 'gym', 'legal_entity', 'Entrega Sur SAS', null, null,
  'owner@actor.test', decode(repeat('a0', 32), 'hex'), 1::smallint,
  'a0000005-0000-4000-8000-000000000005', '019b1000-0000-7000-8000-000000000505',
  decode(repeat('b5', 32), 'hex')
);

select is(
  (select result #>> '{created_by,name}' from handover_sur),
  'Mateo Ciclo',
  'the handover names who created the gym'
);

select is(
  (select (result #>> '{created_by,person_id}')::uuid from handover_sur),
  '019b1000-0000-7000-8000-000000000004'::uuid,
  'and keeps the person'
);

select is(
  (select result->'cancelled_by' from handover_sur),
  'null'::jsonb,
  'nobody cancelled it yet'
);

select * from organizations.cancel_unclaimed_organization(
  '019b1000-0000-7000-8000-000000000006', '019b1000-0000-7000-8000-000000000046',
  (select (result->>'organization_id')::uuid from handover_sur),
  'a0000006-0000-4000-8000-000000000006', '019b1000-0000-7000-8000-000000000506',
  decode(repeat('b6', 32), 'hex')
);

select is(
  organizations.handover_projection((select (result->>'organization_id')::uuid from handover_sur))
    #>> '{cancelled_by,name}',
  'Sara Ciclo',
  'the cancellation names who cancelled it'
);

select is(
  (organizations.handover_projection((select (result->>'organization_id')::uuid from handover_sur))
    #>> '{cancelled_by,person_id}')::uuid,
  '019b1000-0000-7000-8000-000000000006'::uuid,
  'and keeps the person'
);

select is(
  organizations.handover_projection((select (result->>'organization_id')::uuid from handover_sur))
    #>> '{created_by,name}',
  'Mateo Ciclo',
  'and the creation is still told after it'
);

-- ---------------------------------------------------------------------------
-- The helper names Allfit's team and nobody else
-- ---------------------------------------------------------------------------

select is(
  support.platform_staff_name('019b1000-0000-7000-8000-000000000004'),
  'Mateo Ciclo',
  'a team member is named'
);

select is(
  support.platform_staff_name('019b1000-0000-7000-8000-000000000005'),
  null,
  'a person outside the team is never named, though they exist'
);

select is(
  support.platform_staff_name('019b1000-0000-7000-8000-000000000999'),
  null,
  'nor is somebody who does not exist'
);

select ok(
  not has_function_privilege('allfit_api', 'support.platform_staff_name(uuid)', 'execute'),
  'the runtime role cannot call the helper to read names'
);

select * from finish();

rollback;
