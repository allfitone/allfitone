-- T-PLN-SUSPEND-01 — the program a suspended gym assigned is paused (`HU-BO-016` c3).
--
-- Suspending a gym already opens a block per client, and `blocks_future_sessions` said
-- what it meant without anything reading it. As decided: while the gym is suspended the
-- sessions of every program it assigned are shown paused and do not start; her own
-- training goes on as always. Lifting the suspension resumes the program on its own
-- dates, and the days that passed while it lasted stay missed: they do not start later.
--
-- Nothing is written to a session. The pause is derived from the blocks at read time,
-- so a block that closes takes its effect with it and leaves only the blocked period.
--
-- Her plan paused for a pending payment holds the same program (T-PLN-SUSPEND-02). When
-- both hold it, the gym's suspension is what she is told: paying does not lift it.

begin;

select plan(18);

insert into identity.people (id, given_name, family_name, status)
values
  ('019bd000-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019bd000-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019bd000-0000-7000-8000-000000000003', 'Lifecycle', 'Gamma', 'active'),
  ('019bd000-0000-7000-8000-000000000006', 'Owner', 'Zeta', 'active'),
  ('019bd000-0000-7000-8000-000000000008', 'Ana', 'Cliente', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019bd000-0000-7000-8000-000000000021', 'workos', 'https://issuer.test', 'alpha_pause', null),
  ('019bd000-0000-7000-8000-000000000022', 'workos', 'https://issuer.test', 'beta_pause', null),
  ('019bd000-0000-7000-8000-000000000023', 'workos', 'https://issuer.test', 'gamma_pause',
    '019bd000-0000-7000-8000-000000000003');

select support.bootstrap_backoffice_administrators(
  '019bd000-0000-7000-8000-000000000001', 'alpha_pause',
  '019bd000-0000-7000-8000-000000000002', 'beta_pause',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-PLN-SUSPEND-01'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
)
select session_id, account_id, 'sid_' || suffix, 'backoffice', decode(repeat(hash_byte, 32), 'hex'),
  'v1.' || suffix, clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'
from (values
  ('019bd000-0000-7000-8000-000000000041'::uuid, '019bd000-0000-7000-8000-000000000021'::uuid,
    'alpha_pause', 'd1'),
  ('019bd000-0000-7000-8000-000000000043'::uuid, '019bd000-0000-7000-8000-000000000023'::uuid,
    'gamma_pause', 'd3')
) as session_row(session_id, account_id, suffix, hash_byte);

select support.assign_platform_role(
  '019bd000-0000-7000-8000-000000000001', '019bd000-0000-7000-8000-000000000041',
  '019bd000-0000-7000-8000-000000000003', 'allfit_admin',
  '019bd000-0000-7000-8000-000000000103', '019bd000-0000-7000-8000-000000000203',
  decode(repeat('c3', 32), 'hex')
);
select support.assign_platform_duty(
  '019bd000-0000-7000-8000-000000000001', '019bd000-0000-7000-8000-000000000041',
  '019bd000-0000-7000-8000-000000000003', 'manage_organization_lifecycle',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-PAUSE',
  '019bd000-0000-7000-8000-000000000113', '019bd000-0000-7000-8000-000000000213',
  decode(repeat('e3', 32), 'hex')
);

insert into organizations.organizations (id, type_code, display_name, legal_name, responsible_party)
values ('019bd000-0000-7000-8000-000000000301', 'gym', 'Gimnasio Pausado', 'Pausado SAS',
  '{"party_kind":"legal_entity","party_name":"Pausado SAS","purpose":"studio_operations"}'::jsonb);
insert into organizations.organization_memberships (id, organization_id, person_id, status)
values ('019bd000-0000-7000-8000-000000000311', '019bd000-0000-7000-8000-000000000301',
  '019bd000-0000-7000-8000-000000000006', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values ('019bd000-0000-7000-8000-000000000311', 'owner');

insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019bd000-0000-7000-8000-000000000321', '019bd000-0000-7000-8000-000000000008',
  '019bd000-0000-7000-8000-000000000301', 'active');

-- What she pays the gym, so her plan can be paused as well.
insert into payments.organization_plans (id, organization_id, name, status)
values ('019bd000-0000-7000-8000-000000000331', '019bd000-0000-7000-8000-000000000301',
  'Mensual', 'published');
insert into payments.plan_versions (
  id, plan_id, organization_id, version_number, amount_minor, currency_code, billing_period
) values (
  '019bd000-0000-7000-8000-000000000332', '019bd000-0000-7000-8000-000000000331',
  '019bd000-0000-7000-8000-000000000301', 1, 12000000, 'COP', 'month'
);
insert into payments.plan_subscriptions (id, person_id, organization_id, plan_version_id)
values ('019bd000-0000-7000-8000-000000000333', '019bd000-0000-7000-8000-000000000008',
  '019bd000-0000-7000-8000-000000000301', '019bd000-0000-7000-8000-000000000332');

-- The gym's program and her own, each with one routine.
insert into planning.session_templates (
  id, content_scope, owner_organization_id, owner_person_id, author_person_id, discipline_code, status
) values
  ('019bd000-0000-7000-8000-000000000801', 'organization', '019bd000-0000-7000-8000-000000000301',
    null, '019bd000-0000-7000-8000-000000000006', 'test_strength', 'published'),
  ('019bd000-0000-7000-8000-000000000802', 'person', null,
    '019bd000-0000-7000-8000-000000000008', '019bd000-0000-7000-8000-000000000008',
    'test_strength', 'published');
insert into planning.programs (
  id, content_scope, owner_organization_id, owner_person_id, author_person_id, status
) values
  ('019bd000-0000-7000-8000-000000000803', 'organization', '019bd000-0000-7000-8000-000000000301',
    null, '019bd000-0000-7000-8000-000000000006', 'published'),
  ('019bd000-0000-7000-8000-000000000804', 'person', null,
    '019bd000-0000-7000-8000-000000000008', '019bd000-0000-7000-8000-000000000008', 'published');
select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (
  id, template_id, version_number, discipline_code, activity_type_id, title, content_hash
) values
  ('019bd000-0000-7000-8000-000000000805', '019bd000-0000-7000-8000-000000000801', 1,
    'test_strength', '019c0000-0000-7000-8000-000000000011', 'Pierna', decode(repeat('d5', 32), 'hex')),
  ('019bd000-0000-7000-8000-000000000806', '019bd000-0000-7000-8000-000000000802', 1,
    'test_strength', '019c0000-0000-7000-8000-000000000011', 'En casa', decode(repeat('d6', 32), 'hex'));
insert into planning.program_versions (id, program_id, version_number, title, content_hash)
values
  ('019bd000-0000-7000-8000-000000000807', '019bd000-0000-7000-8000-000000000803', 1,
    'Fuerza del gimnasio', decode(repeat('d7', 32), 'hex')),
  ('019bd000-0000-7000-8000-000000000808', '019bd000-0000-7000-8000-000000000804', 1,
    'Lo mío', decode(repeat('d8', 32), 'hex'));
select set_config('app.planning_publication', '', true);

insert into planning.program_assignments (
  id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone,
  display_order
) values
  ('019bd000-0000-7000-8000-000000000811', '019bd000-0000-7000-8000-000000000008',
    '019bd000-0000-7000-8000-000000000807', '019bd000-0000-7000-8000-000000000321', 'active',
    current_date - 21, 'UTC', 0),
  ('019bd000-0000-7000-8000-000000000812', '019bd000-0000-7000-8000-000000000008',
    '019bd000-0000-7000-8000-000000000808', null, 'personal', current_date - 21, 'UTC', 1);
insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id, started_at)
values ('019bd000-0000-7000-8000-000000000811', '019bd000-0000-7000-8000-000000000008',
  '019bd000-0000-7000-8000-000000000321', clock_timestamp() - interval '21 days');

-- Monday of this week, in UTC, which is the zone every session here lives in.
select date_trunc('week', clock_timestamp() at time zone 'UTC')::date as monday \gset

-- This week: three of the gym's sessions, one of hers, and one of the gym's today.
-- Last week, Monday to Friday, one a day, and a second Wednesday already trained.
insert into planning.planned_sessions (
  id, assignment_id, person_id, template_version_id, scheduled_at, timezone, status,
  week_starts_on, program_day
)
select id, assignment_id, '019bd000-0000-7000-8000-000000000008', template_version_id, at, 'UTC',
       status, date_trunc('week', at at time zone 'UTC')::date,
       extract(isodow from at at time zone 'UTC')::integer
from (values
  ('019bd000-0000-7000-8000-000000000901'::uuid, '019bd000-0000-7000-8000-000000000811'::uuid,
    '019bd000-0000-7000-8000-000000000805'::uuid, (:'monday'::date + time '07:00') at time zone 'UTC', 'scheduled'),
  ('019bd000-0000-7000-8000-000000000902'::uuid, '019bd000-0000-7000-8000-000000000811'::uuid,
    '019bd000-0000-7000-8000-000000000805'::uuid, (:'monday'::date + 2 + time '07:00') at time zone 'UTC', 'scheduled'),
  ('019bd000-0000-7000-8000-000000000903'::uuid, '019bd000-0000-7000-8000-000000000811'::uuid,
    '019bd000-0000-7000-8000-000000000805'::uuid, (:'monday'::date + 4 + time '07:00') at time zone 'UTC', 'scheduled'),
  ('019bd000-0000-7000-8000-000000000904'::uuid, '019bd000-0000-7000-8000-000000000811'::uuid,
    '019bd000-0000-7000-8000-000000000805'::uuid, clock_timestamp(), 'scheduled'),
  ('019bd000-0000-7000-8000-000000000909'::uuid, '019bd000-0000-7000-8000-000000000812'::uuid,
    '019bd000-0000-7000-8000-000000000806'::uuid, (:'monday'::date + 1 + time '07:00') at time zone 'UTC', 'scheduled'),
  ('019bd000-0000-7000-8000-000000000911'::uuid, '019bd000-0000-7000-8000-000000000811'::uuid,
    '019bd000-0000-7000-8000-000000000805'::uuid, (:'monday'::date - 7 + time '07:00') at time zone 'UTC', 'scheduled'),
  ('019bd000-0000-7000-8000-000000000912'::uuid, '019bd000-0000-7000-8000-000000000811'::uuid,
    '019bd000-0000-7000-8000-000000000805'::uuid, (:'monday'::date - 6 + time '07:00') at time zone 'UTC', 'scheduled'),
  ('019bd000-0000-7000-8000-000000000913'::uuid, '019bd000-0000-7000-8000-000000000811'::uuid,
    '019bd000-0000-7000-8000-000000000805'::uuid, (:'monday'::date - 5 + time '07:00') at time zone 'UTC', 'scheduled'),
  ('019bd000-0000-7000-8000-000000000914'::uuid, '019bd000-0000-7000-8000-000000000811'::uuid,
    '019bd000-0000-7000-8000-000000000805'::uuid, (:'monday'::date - 4 + time '07:00') at time zone 'UTC', 'scheduled'),
  ('019bd000-0000-7000-8000-000000000915'::uuid, '019bd000-0000-7000-8000-000000000811'::uuid,
    '019bd000-0000-7000-8000-000000000805'::uuid, (:'monday'::date - 3 + time '07:00') at time zone 'UTC', 'scheduled'),
  ('019bd000-0000-7000-8000-000000000916'::uuid, '019bd000-0000-7000-8000-000000000811'::uuid,
    '019bd000-0000-7000-8000-000000000805'::uuid, (:'monday'::date - 5 + time '06:00') at time zone 'UTC', 'completed')
) as planned(id, assignment_id, template_version_id, at, status);

create function pg_temp.as_ana()
returns void language sql as $$
  select set_config('app.actor_kind', 'person', true),
         set_config('app.actor_person_id', '019bd000-0000-7000-8000-000000000008', true),
         set_config('app.actor_session_id', '', true),
         set_config('app.request_id', gen_random_uuid()::text, true);
$$;

create function pg_temp.as_lifecycle()
returns void language sql as $$
  select set_config('app.actor_kind', 'support', true),
         set_config('app.actor_person_id', '019bd000-0000-7000-8000-000000000003', true),
         set_config('app.actor_session_id', '019bd000-0000-7000-8000-000000000043', true);
$$;

create function pg_temp.start(planned_session text, command_number integer)
returns uuid language sql as $$
  select id from execution.start_planned_session_attempt(
    '019bd000-0000-7000-8000-000000000008', planned_session::uuid, clock_timestamp(), 'UTC',
    'detailed', 'manual',
    ('019bd000-0000-4000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019bd000-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    extensions.digest('start' || command_number, 'sha256'));
$$;

-- Each session of the week Space shows her, as `state/cause`.
create function pg_temp.week_holds()
returns text[] language sql as $$
  select array_agg(
           coalesce((entry->'hold'->>'state') || '/' || (entry->'hold'->>'cause'), 'none')
           order by entry->>'scheduled_at')
  from planning.read_week_plan('019bd000-0000-7000-8000-000000000008', 'UTC') as plan,
       jsonb_array_elements(plan.sessions) as entry;
$$;

create function pg_temp.hold(planned_session text)
returns text language sql as $$
  select coalesce((held->>'state') || '/' || (held->>'cause'), 'none')
  from planning.session_hold_of(planned_session::uuid) as held
$$;

create function pg_temp.today_hold()
returns text language sql as $$
  select coalesce((hold->>'state') || '/' || (hold->>'cause'), 'none')
  from planning.read_today_session('019bd000-0000-7000-8000-000000000008', 'UTC')
$$;

-- ---------------------------------------------------------------------------
-- While the gym is suspended
-- ---------------------------------------------------------------------------

select pg_temp.as_lifecycle();
select organizations.suspend_organization(
  '019bd000-0000-7000-8000-000000000003', '019bd000-0000-7000-8000-000000000043',
  '019bd000-0000-7000-8000-000000000301', 'nonpayment',
  '44444444-4444-4444-8444-444444440001', '019bd000-0000-7000-8000-000000000501',
  decode(repeat('b1', 32), 'hex')
);

set local role allfit_api;
select pg_temp.as_ana();

select is(
  pg_temp.week_holds(),
  array['paused/organization_suspension', 'paused/organization_suspension',
        'paused/organization_suspension', 'paused/organization_suspension'],
  'every session of the gym''s program this week is shown paused'
);

select is(
  pg_temp.today_hold(),
  'paused/organization_suspension',
  'and so is the one Hoy offers'
);

select throws_ok(
  $$ select pg_temp.start('019bd000-0000-7000-8000-000000000904', 1001) $$,
  '23514', null,
  'a session of the gym''s program does not start while the gym is suspended'
);

select throws_ok(
  $$ select pg_temp.start('019bd000-0000-7000-8000-000000000916', 1002) $$,
  '23514', null,
  'nor is one already trained repeated: the program is paused, not one day of it'
);

select lives_ok(
  $$ select pg_temp.start('019bd000-0000-7000-8000-000000000909', 1003) $$,
  'her own program starts as always'
);

reset role;
update planning.program_assignments set display_order = 2
where id = '019bd000-0000-7000-8000-000000000811';
set local role allfit_api;
select pg_temp.as_ana();

select is(
  pg_temp.week_holds(),
  array['none'],
  'and her own week shows nothing paused'
);

reset role;
update planning.program_assignments set display_order = 0
where id = '019bd000-0000-7000-8000-000000000811';

-- Meanwhile the gym also paused her plan for a pending payment.
insert into planning.service_access_blocks (
  id, person_id, organization_id, relationship_id, subscription_id, source_kind,
  blocks_future_sessions, blocks_professional_contribution, created_by_kind,
  created_by_membership_id
) values (
  '019bd000-0000-7000-8000-000000000334', '019bd000-0000-7000-8000-000000000008',
  '019bd000-0000-7000-8000-000000000301', '019bd000-0000-7000-8000-000000000321',
  '019bd000-0000-7000-8000-000000000333', 'subscription_suspension', true, true, 'person',
  '019bd000-0000-7000-8000-000000000311'
);

set local role allfit_api;
select pg_temp.as_ana();

select is(
  pg_temp.week_holds(),
  array['paused/organization_suspension', 'paused/organization_suspension',
        'paused/organization_suspension', 'paused/organization_suspension'],
  'held by both, she is told the gym is suspended: paying would not lift it'
);

reset role;

-- ---------------------------------------------------------------------------
-- Once it is lifted
-- ---------------------------------------------------------------------------

select pg_temp.as_lifecycle();
select organizations.reactivate_organization(
  '019bd000-0000-7000-8000-000000000003', '019bd000-0000-7000-8000-000000000043',
  '019bd000-0000-7000-8000-000000000301',
  '44444444-4444-4444-8444-444444440002', '019bd000-0000-7000-8000-000000000502',
  decode(repeat('b2', 32), 'hex')
);

set local role allfit_api;
select pg_temp.as_ana();

select is(
  pg_temp.week_holds(),
  array['paused/subscription_suspension', 'paused/subscription_suspension',
        'paused/subscription_suspension', 'paused/subscription_suspension'],
  'lifting the gym''s suspension leaves her plan paused: one cause does not close another'
);

reset role;
update planning.service_access_blocks set ended_at = clock_timestamp()
where id = '019bd000-0000-7000-8000-000000000334';
set local role allfit_api;
select pg_temp.as_ana();

select is(
  pg_temp.week_holds(),
  array['none', 'none', 'none', 'none'],
  'lifted the same day, the week is as it was: no day passed while it lasted'
);

select lives_ok(
  $$ select pg_temp.start('019bd000-0000-7000-8000-000000000904', 1004) $$,
  'and today''s session starts again'
);

reset role;

-- ---------------------------------------------------------------------------
-- A suspension that lasted days: Tuesday morning to Thursday morning, last week
-- ---------------------------------------------------------------------------

-- Same cause as the real one, moved back in time: the command can only start now.
create temporary table past_suspension on commit drop as
select gen_random_uuid() as event_id;

insert into organizations.organization_events (
  id, organization_id, event_type, before_snapshot, after_snapshot, occurred_at,
  actor_person_id, actor_duty_assignment_id
)
select (select event_id from past_suspension), organization_id, event_type, before_snapshot,
       after_snapshot, (:'monday'::date - 6 + time '10:00') at time zone 'UTC',
       actor_person_id, actor_duty_assignment_id
from organizations.organization_events
where organization_id = '019bd000-0000-7000-8000-000000000301'
  and event_type = 'organization.suspended.v1';

insert into planning.service_access_blocks (
  person_id, organization_id, relationship_id, organization_event_id, source_kind,
  blocks_future_sessions, blocks_professional_contribution, created_by_kind, started_at, ended_at
) values (
  '019bd000-0000-7000-8000-000000000008', '019bd000-0000-7000-8000-000000000301',
  '019bd000-0000-7000-8000-000000000321', (select event_id from past_suspension),
  'organization_suspension', true, true, 'support',
  (:'monday'::date - 6 + time '10:00') at time zone 'UTC',
  (:'monday'::date - 4 + time '09:00') at time zone 'UTC'
);

-- Her plan was paused those same days.
insert into planning.service_access_blocks (
  person_id, organization_id, relationship_id, subscription_id, source_kind,
  blocks_future_sessions, blocks_professional_contribution, created_by_kind,
  created_by_membership_id, started_at, ended_at
) values (
  '019bd000-0000-7000-8000-000000000008', '019bd000-0000-7000-8000-000000000301',
  '019bd000-0000-7000-8000-000000000321', '019bd000-0000-7000-8000-000000000333',
  'subscription_suspension', true, true, 'person', '019bd000-0000-7000-8000-000000000311',
  (:'monday'::date - 6 + time '10:00') at time zone 'UTC',
  (:'monday'::date - 4 + time '09:00') at time zone 'UTC'
);

set local role allfit_owner;
select pg_temp.as_ana();

select is(
  pg_temp.hold('019bd000-0000-7000-8000-000000000911'),
  'none',
  'the day before the suspension is an ordinary day'
);

select is(
  array[pg_temp.hold('019bd000-0000-7000-8000-000000000912'),
        pg_temp.hold('019bd000-0000-7000-8000-000000000913')],
  array['missed/organization_suspension', 'missed/organization_suspension'],
  'the day it started, even before it started, and the days it lasted are missed, naming the gym'
);

select is(
  array[pg_temp.hold('019bd000-0000-7000-8000-000000000914'),
        pg_temp.hold('019bd000-0000-7000-8000-000000000915')],
  array['none', 'none'],
  'the day it was lifted and the days after are ordinary again'
);

select is(
  pg_temp.hold('019bd000-0000-7000-8000-000000000916'),
  'none',
  'what was trained during those days stays trained, not missed'
);

reset role;
set local role allfit_api;
select pg_temp.as_ana();

select throws_ok(
  $$ select pg_temp.start('019bd000-0000-7000-8000-000000000913', 1005) $$,
  '23514', null,
  'a missed day does not start later'
);

select lives_ok(
  $$ select pg_temp.start('019bd000-0000-7000-8000-000000000914', 1006) $$,
  'the day it was lifted does'
);

select is(
  pg_temp.week_holds(),
  array['none', 'none', 'none', 'none'],
  'and a suspension that ended last week leaves this week as it was'
);

reset role;

-- Her plan paused again now: a day the gym's suspension cost stays missed, naming it.
insert into planning.service_access_blocks (
  person_id, organization_id, relationship_id, subscription_id, source_kind,
  blocks_future_sessions, blocks_professional_contribution, created_by_kind,
  created_by_membership_id
) values (
  '019bd000-0000-7000-8000-000000000008', '019bd000-0000-7000-8000-000000000301',
  '019bd000-0000-7000-8000-000000000321', '019bd000-0000-7000-8000-000000000333',
  'subscription_suspension', true, true, 'person', '019bd000-0000-7000-8000-000000000311'
);

set local role allfit_owner;
select pg_temp.as_ana();

select is(
  array[pg_temp.hold('019bd000-0000-7000-8000-000000000913'),
        pg_temp.hold('019bd000-0000-7000-8000-000000000915')],
  array['missed/organization_suspension', 'paused/subscription_suspension'],
  'a missed day outranks a pause of the other cause, and the rest is paused'
);

reset role;

select * from finish();

rollback;
