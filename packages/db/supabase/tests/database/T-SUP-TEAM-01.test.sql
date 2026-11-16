-- T-SUP-TEAM-01 — HU-BO-029 criterion 1: the team inventory says who holds access.
--
-- `OP-SUP-008` and `OP-SUP-011` answered only identifiers, so the Team screen showed a
-- UUID where it should say who the person is, and who granted it. Each role and duty now
-- carries the holder's name and the grantor's, from `identity.people`.
--
-- A name is personal data, so reading the inventory leaves an access event for every
-- person it names before the page travels, as the person search does (ADR-046). A person
-- the page does not name gets none.

begin;

select plan(9);

insert into identity.people (id, given_name, family_name)
values
  ('019c5000-0000-7000-8000-000000000001', 'Ana', 'Primera'),
  ('019c5000-0000-7000-8000-000000000002', 'Bruno', 'Segundo'),
  ('019c5000-0000-7000-8000-000000000003', 'Carla', 'Nueva'),
  ('019c5000-0000-7000-8000-000000000004', 'Dario', 'Ajeno');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019c5000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'team-ana', null),
  ('019c5000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'team-bruno', null);

select support.bootstrap_backoffice_administrators(
  '019c5000-0000-7000-8000-000000000001', 'team-ana',
  '019c5000-0000-7000-8000-000000000002', 'team-bruno',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-TEAM-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values (
  '019c5000-0000-7000-8000-000000000021', '019c5000-0000-7000-8000-000000000011',
  'sid_team_ana', 'backoffice', decode(repeat('c5', 32), 'hex'), 'v1.team-ana',
  clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'
);

create temporary table granted_role on commit drop as
select result
from support.assign_platform_role(
  '019c5000-0000-7000-8000-000000000001', '019c5000-0000-7000-8000-000000000021',
  '019c5000-0000-7000-8000-000000000003', 'allfit_admin',
  '019c5000-0000-7000-8000-000000000101', '019c5000-0000-7000-8000-000000000201',
  decode(repeat('51', 32), 'hex')
);

select is(
  (select result ->> 'person_name' from granted_role),
  'Carla Nueva',
  'granting the role answers the name of who received it'
);

create temporary table events_before on commit drop as
select count(*) as n
from privacy.access_events
where actor_person_id = '019c5000-0000-7000-8000-000000000001'
  and resource = 'support.platform_access';

create temporary table role_page on commit drop as
select result
from support.list_platform_role_assignments(
  '019c5000-0000-7000-8000-000000000001', '019c5000-0000-7000-8000-000000000021',
  101, null, null, null
);

select is(
  (select result ->> 'person_name' from role_page
   where result ->> 'person_id' = '019c5000-0000-7000-8000-000000000003'),
  'Carla Nueva',
  'a base role names who holds it'
);

select is(
  (select result ->> 'granted_by_name' from role_page
   where result ->> 'person_id' = '019c5000-0000-7000-8000-000000000003'),
  'Ana Primera',
  'a base role names who granted it'
);

create temporary table duty_page on commit drop as
select result
from support.list_platform_duty_assignments(
  '019c5000-0000-7000-8000-000000000001', '019c5000-0000-7000-8000-000000000021',
  '019c5000-0000-7000-8000-000000000003', 'audit_platform_access', null,
  101, null, null, null, null
);

select is(
  (select result ->> 'person_name' from duty_page),
  'Carla Nueva',
  'a duty names who holds it'
);

select is(
  (select result ->> 'granted_by_name' from duty_page),
  'Ana Primera',
  'a duty names who granted it'
);

select ok(
  exists (
    select 1 from privacy.access_events
    where actor_person_id = '019c5000-0000-7000-8000-000000000001'
      and subject_person_id = '019c5000-0000-7000-8000-000000000003'
      and resource = 'support.platform_access'
      and result = 'allowed'
      and access_mode = 'support_metadata'
  ),
  'reading the inventory leaves an event on every person it names'
);

select ok(
  exists (
    select 1 from privacy.access_events
    where actor_person_id = '019c5000-0000-7000-8000-000000000001'
      and subject_person_id = '019c5000-0000-7000-8000-000000000002'
      and resource = 'support.platform_access'
  ),
  'the other administrator, named as holder and grantor, is logged too'
);

select is(
  (select count(*) from privacy.access_events
   where subject_person_id = '019c5000-0000-7000-8000-000000000004'
     and resource = 'support.platform_access'),
  0::bigint,
  'a person the inventory does not name gets no event'
);

select cmp_ok(
  (select count(*) from privacy.access_events
   where actor_person_id = '019c5000-0000-7000-8000-000000000001'
     and resource = 'support.platform_access'),
  '>',
  (select n from events_before),
  'every page read is recorded before it travels'
);

select * from finish();

rollback;
