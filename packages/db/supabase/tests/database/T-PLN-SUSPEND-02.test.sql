-- T-PLN-SUSPEND-02 — a plan paused for a pending payment holds the gym's program and its
-- coach (`OP-PAY-008`, `OP-PAY-009`; HU-SP-083, HU-SP-088).
--
-- Suspending a subscription already opened a block with both effects, and both apps
-- already promised them: Space tells her that her future sessions with the gym are
-- paused, Studio tells the gym that her coach cannot record changes while it lasts.
-- Nothing enforced either. What has to hold now:
--
--   · Her sessions of the gym's program are held as under a suspended gym, and say the
--     cause, so Space can say which one. Her own training goes on.
--   · Her coach still reads what she shares, but nobody at the gym contributes to it:
--     assigning, moving, adjusting and cancelling answer AF424, and the policies that
--     guard those writes refuse them too. The coach never reads the commercial cause.
--   · Reactivating gives all of it back, with no new consent. A day that passed while it
--     lasted stays missed, and a later pause does not turn it back into a paused one.
--   · The pause is hers with the gym, not one relationship's: ending the relationship
--     still works, and one begun while her plan is paused is held too.

begin;

select plan(27);

insert into identity.people (id, given_name, family_name, status)
values
  ('019bd100-0000-7000-8000-000000000001', 'Olivia', 'Owner', 'active'),
  ('019bd100-0000-7000-8000-000000000002', 'Camilo', 'Coach', 'active'),
  ('019bd100-0000-7000-8000-000000000008', 'Ana', 'Cliente', 'active');

insert into organizations.organizations (id, type_code, display_name, legal_name, responsible_party)
values ('019bd100-0000-7000-8000-000000000301', 'gym', 'Gimnasio Moroso', 'Moroso SAS',
  '{"party_kind":"legal_entity","party_name":"Moroso SAS","purpose":"studio_operations"}'::jsonb);
insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019bd100-0000-7000-8000-000000000311', '019bd100-0000-7000-8000-000000000301',
    '019bd100-0000-7000-8000-000000000001', 'active'),
  ('019bd100-0000-7000-8000-000000000312', '019bd100-0000-7000-8000-000000000301',
    '019bd100-0000-7000-8000-000000000002', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019bd100-0000-7000-8000-000000000311', 'owner'),
  ('019bd100-0000-7000-8000-000000000312', 'coach');

insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019bd100-0000-7000-8000-000000000321', '019bd100-0000-7000-8000-000000000008',
  '019bd100-0000-7000-8000-000000000301', 'active');
insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status
) values (
  '019bd100-0000-7000-8000-000000000331', '019bd100-0000-7000-8000-000000000321',
  '019bd100-0000-7000-8000-000000000008', '019bd100-0000-7000-8000-000000000301',
  '019bd100-0000-7000-8000-000000000312', 'holder', 'active'
);

-- She shares her training to be planned, through the real consent chain.
insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019bd100-0000-7000-8000-000000000401', 'relationship_training', 7, 'published',
  clock_timestamp());
insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019bd100-0000-7000-8000-000000000402', '019bd100-0000-7000-8000-000000000301',
  '019bd100-0000-7000-8000-000000000311', 'email', 'ana@example.test',
  extensions.digest('moroso-token', 'sha256'), 1, extensions.digest('moroso-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Moroso SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019bd100-0000-7000-8000-000000000403', '019bd100-0000-7000-8000-000000000402',
  'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values (
  '019bd100-0000-7000-8000-000000000404', '019bd100-0000-7000-8000-000000000403',
  '019bd100-0000-7000-8000-000000000401', 'relationship_training', 'contribute',
  'Plan the training', '{"title":"Training"}'::jsonb, 'accepted', clock_timestamp()
);
insert into privacy.consent_events (
  id, person_id, relationship_id, organization_id, invitation_scope_option_id,
  scope_definition_id, scope_code, decision, presented_snapshot
) values (
  '019bd100-0000-7000-8000-000000000405', '019bd100-0000-7000-8000-000000000008',
  '019bd100-0000-7000-8000-000000000321', '019bd100-0000-7000-8000-000000000301',
  '019bd100-0000-7000-8000-000000000404', '019bd100-0000-7000-8000-000000000401',
  'relationship_training', 'accepted', '{"title":"Training"}'::jsonb
);
insert into privacy.data_grants (
  id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
  consent_event_id, access_level, purpose
) values (
  '019bd100-0000-7000-8000-000000000406', '019bd100-0000-7000-8000-000000000008',
  '019bd100-0000-7000-8000-000000000321', '019bd100-0000-7000-8000-000000000301',
  '019bd100-0000-7000-8000-000000000401', 'relationship_training',
  '019bd100-0000-7000-8000-000000000405', 'contribute', 'Plan the training'
);

-- What she pays the gym.
insert into payments.organization_plans (id, organization_id, name, status)
values ('019bd100-0000-7000-8000-000000000501', '019bd100-0000-7000-8000-000000000301',
  'Mensual', 'published');
insert into payments.plan_versions (
  id, plan_id, organization_id, version_number, amount_minor, currency_code, billing_period
) values (
  '019bd100-0000-7000-8000-000000000502', '019bd100-0000-7000-8000-000000000501',
  '019bd100-0000-7000-8000-000000000301', 1, 12000000, 'COP', 'month'
);
insert into payments.plan_subscriptions (id, person_id, organization_id, plan_version_id)
values ('019bd100-0000-7000-8000-000000000503', '019bd100-0000-7000-8000-000000000008',
  '019bd100-0000-7000-8000-000000000301', '019bd100-0000-7000-8000-000000000502');

-- The gym's program and her own, each with one routine.
insert into planning.session_templates (
  id, content_scope, owner_organization_id, owner_person_id, author_person_id, discipline_code, status
) values
  ('019bd100-0000-7000-8000-000000000801', 'organization', '019bd100-0000-7000-8000-000000000301',
    null, '019bd100-0000-7000-8000-000000000002', 'test_strength', 'published'),
  ('019bd100-0000-7000-8000-000000000802', 'person', null,
    '019bd100-0000-7000-8000-000000000008', '019bd100-0000-7000-8000-000000000008',
    'test_strength', 'published');
insert into planning.programs (
  id, content_scope, owner_organization_id, owner_person_id, author_person_id, status
) values
  ('019bd100-0000-7000-8000-000000000803', 'organization', '019bd100-0000-7000-8000-000000000301',
    null, '019bd100-0000-7000-8000-000000000002', 'published'),
  ('019bd100-0000-7000-8000-000000000804', 'person', null,
    '019bd100-0000-7000-8000-000000000008', '019bd100-0000-7000-8000-000000000008', 'published');
select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (
  id, template_id, version_number, discipline_code, activity_type_id, title, content_hash
) values
  ('019bd100-0000-7000-8000-000000000805', '019bd100-0000-7000-8000-000000000801', 1,
    'test_strength', '019c0000-0000-7000-8000-000000000011', 'Pierna', decode(repeat('a5', 32), 'hex')),
  ('019bd100-0000-7000-8000-000000000806', '019bd100-0000-7000-8000-000000000802', 1,
    'test_strength', '019c0000-0000-7000-8000-000000000011', 'En casa', decode(repeat('a6', 32), 'hex'));
insert into planning.program_versions (id, program_id, version_number, title, content_hash, status)
values
  ('019bd100-0000-7000-8000-000000000807', '019bd100-0000-7000-8000-000000000803', 1,
    'Fuerza del gimnasio', decode(repeat('a7', 32), 'hex'), 'published'),
  ('019bd100-0000-7000-8000-000000000808', '019bd100-0000-7000-8000-000000000804', 1,
    'Lo mío', decode(repeat('a8', 32), 'hex'), 'published');
insert into planning.program_version_sessions (program_version_id, template_version_id, position, week, day)
values ('019bd100-0000-7000-8000-000000000807', '019bd100-0000-7000-8000-000000000805', 1, 1, 1);
select set_config('app.planning_publication', '', true);

insert into planning.program_assignments (
  id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone,
  display_order
) values
  ('019bd100-0000-7000-8000-000000000811', '019bd100-0000-7000-8000-000000000008',
    '019bd100-0000-7000-8000-000000000807', '019bd100-0000-7000-8000-000000000321', 'active',
    current_date - 21, 'UTC', 0),
  ('019bd100-0000-7000-8000-000000000812', '019bd100-0000-7000-8000-000000000008',
    '019bd100-0000-7000-8000-000000000808', null, 'personal', current_date - 21, 'UTC', 1);
insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id, started_at)
values ('019bd100-0000-7000-8000-000000000811', '019bd100-0000-7000-8000-000000000008',
  '019bd100-0000-7000-8000-000000000321', clock_timestamp() - interval '21 days');

-- Monday of this week, in UTC, which is the zone every session here lives in.
select date_trunc('week', clock_timestamp() at time zone 'UTC')::date as monday \gset

-- This week: three of the gym's sessions, one of hers, and one of the gym's today.
-- Last week: the gym's, Monday to Friday, one a day.
insert into planning.planned_sessions (
  id, assignment_id, person_id, template_version_id, scheduled_at, timezone, status,
  week_starts_on, program_day
)
select id, assignment_id, '019bd100-0000-7000-8000-000000000008', template_version_id, at, 'UTC',
       'scheduled', date_trunc('week', at at time zone 'UTC')::date,
       extract(isodow from at at time zone 'UTC')::integer
from (values
  ('019bd100-0000-7000-8000-000000000901'::uuid, '019bd100-0000-7000-8000-000000000811'::uuid,
    '019bd100-0000-7000-8000-000000000805'::uuid, (:'monday'::date + time '07:00') at time zone 'UTC'),
  ('019bd100-0000-7000-8000-000000000902'::uuid, '019bd100-0000-7000-8000-000000000811'::uuid,
    '019bd100-0000-7000-8000-000000000805'::uuid, (:'monday'::date + 2 + time '07:00') at time zone 'UTC'),
  ('019bd100-0000-7000-8000-000000000903'::uuid, '019bd100-0000-7000-8000-000000000811'::uuid,
    '019bd100-0000-7000-8000-000000000805'::uuid, (:'monday'::date + 4 + time '07:00') at time zone 'UTC'),
  ('019bd100-0000-7000-8000-000000000904'::uuid, '019bd100-0000-7000-8000-000000000811'::uuid,
    '019bd100-0000-7000-8000-000000000805'::uuid, clock_timestamp()),
  ('019bd100-0000-7000-8000-000000000909'::uuid, '019bd100-0000-7000-8000-000000000812'::uuid,
    '019bd100-0000-7000-8000-000000000806'::uuid, (:'monday'::date + 1 + time '07:00') at time zone 'UTC'),
  ('019bd100-0000-7000-8000-000000000911'::uuid, '019bd100-0000-7000-8000-000000000811'::uuid,
    '019bd100-0000-7000-8000-000000000805'::uuid, (:'monday'::date - 7 + time '07:00') at time zone 'UTC'),
  ('019bd100-0000-7000-8000-000000000912'::uuid, '019bd100-0000-7000-8000-000000000811'::uuid,
    '019bd100-0000-7000-8000-000000000805'::uuid, (:'monday'::date - 6 + time '07:00') at time zone 'UTC'),
  ('019bd100-0000-7000-8000-000000000913'::uuid, '019bd100-0000-7000-8000-000000000811'::uuid,
    '019bd100-0000-7000-8000-000000000805'::uuid, (:'monday'::date - 5 + time '07:00') at time zone 'UTC'),
  ('019bd100-0000-7000-8000-000000000914'::uuid, '019bd100-0000-7000-8000-000000000811'::uuid,
    '019bd100-0000-7000-8000-000000000805'::uuid, (:'monday'::date - 4 + time '07:00') at time zone 'UTC'),
  ('019bd100-0000-7000-8000-000000000915'::uuid, '019bd100-0000-7000-8000-000000000811'::uuid,
    '019bd100-0000-7000-8000-000000000805'::uuid, (:'monday'::date - 3 + time '07:00') at time zone 'UTC')
) as planned(id, assignment_id, template_version_id, at);

create function pg_temp.act(person text)
returns void language sql as $$
  select set_config('app.actor_kind', 'person', true),
         set_config('app.actor_person_id', person, true),
         set_config('app.actor_org_id', '', true),
         set_config('app.actor_membership_id', '', true),
         set_config('app.actor_session_id', '', true),
         set_config('app.contract_scope_purpose', '', true),
         set_config('app.contract_scope_id', '', true),
         set_config('app.contract_scope_token', '', true),
         set_config('app.request_id', gen_random_uuid()::text, true);
$$;

-- The coach's context as a command leaves it, to ask the policies' own question.
create function pg_temp.as_coach_member()
returns void language sql as $$
  select pg_temp.act('019bd100-0000-7000-8000-000000000002'),
         set_config('app.actor_org_id', '019bd100-0000-7000-8000-000000000301', true),
         set_config('app.actor_membership_id', '019bd100-0000-7000-8000-000000000312', true);
$$;

create function pg_temp.can(level privacy.access_level)
returns boolean language sql as $$
  select access_control.can_access(
    '019bd100-0000-7000-8000-000000000321', 'relationship_training', level)
$$;

create function pg_temp.failure(statement text)
returns text language plpgsql as $$
declare
  state text;
begin
  execute statement;
  return 'no error';
exception when others then
  get stacked diagnostics state = returned_sqlstate;
  return state;
end
$$;

-- A program written straight into the table, so only the policies decide.
create function pg_temp.write_assignment(n integer)
returns text language sql as $$
  select pg_temp.failure(format(
    'insert into planning.program_assignments (id, person_id, program_version_id,
       origin_relationship_id, lifecycle, starts_on, timezone, display_order)
     values (%L, %L, %L, %L, ''active'', current_date, ''UTC'', 90 + %s)',
    ('019bd100-0000-7000-8000-' || lpad((700 + n)::text, 12, '0'))::uuid,
    '019bd100-0000-7000-8000-000000000008', '019bd100-0000-7000-8000-000000000807',
    '019bd100-0000-7000-8000-000000000321', n))
$$;

create function pg_temp.start(planned_session text, command_number integer)
returns uuid language sql as $$
  select id from execution.start_planned_session_attempt(
    '019bd100-0000-7000-8000-000000000008', planned_session::uuid, clock_timestamp(), 'UTC',
    'detailed', 'manual',
    ('019bd100-0000-4000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019bd100-0000-7000-8000-' || lpad((5000 + command_number)::text, 12, '0'))::uuid,
    extensions.digest('start' || command_number, 'sha256'));
$$;

create function pg_temp.command(n integer)
returns uuid language sql as $$
  select ('019bd100-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid
$$;

create function pg_temp.reschedule(session text, n integer)
returns text language sql as $$
  select pg_temp.failure(format(
    'select * from planning.reschedule_planned_session(%L, %L, %L, %L, 0, %L, %L, %L)',
    '019bd100-0000-7000-8000-000000000002', '019bd100-0000-7000-8000-000000000301',
    session, (clock_timestamp() at time zone 'UTC')::date,
    pg_temp.command(n), pg_temp.command(n), extensions.digest('reschedule' || n, 'sha256')))
$$;

create function pg_temp.suspend(n integer)
returns boolean language sql as $$
  select suspended from payments.suspend_subscription(
    '019bd100-0000-7000-8000-000000000001', '019bd100-0000-7000-8000-000000000301',
    '019bd100-0000-7000-8000-000000000503', pg_temp.command(n), pg_temp.command(n),
    extensions.digest('suspend' || n, 'sha256'))
$$;

-- Each session of the week Space shows her, as `state/cause`.
create function pg_temp.week_holds()
returns text[] language sql as $$
  select array_agg(
           coalesce((entry->'hold'->>'state') || '/' || (entry->'hold'->>'cause'), 'none')
           order by entry->>'scheduled_at')
  from planning.read_week_plan('019bd100-0000-7000-8000-000000000008', 'UTC') as plan,
       jsonb_array_elements(plan.sessions) as entry;
$$;

create function pg_temp.hold(planned_session text)
returns text language sql as $$
  select coalesce((held->>'state') || '/' || (held->>'cause'), 'none')
  from planning.session_hold_of(planned_session::uuid) as held
$$;

set local role allfit_owner;
select pg_temp.as_coach_member();

select is(pg_temp.can('contribute'), true, 'before anything is paused her coach contributes');

reset role;

-- ---------------------------------------------------------------------------
-- The gym pauses her plan for a pending payment
-- ---------------------------------------------------------------------------

set local role allfit_api;
select pg_temp.act('019bd100-0000-7000-8000-000000000001');
select pg_temp.suspend(1);

select pg_temp.act('019bd100-0000-7000-8000-000000000008');

select is(
  pg_temp.week_holds(),
  array['paused/subscription_suspension', 'paused/subscription_suspension',
        'paused/subscription_suspension', 'paused/subscription_suspension'],
  'every session of the gym''s program this week is held, saying it is her plan'
);

select is(
  (select hold from planning.read_today_session('019bd100-0000-7000-8000-000000000008', 'UTC')),
  '{"cause": "subscription_suspension", "state": "paused"}'::jsonb,
  'and so is the one Hoy offers'
);

select is(
  pg_temp.failure($$ select pg_temp.start('019bd100-0000-7000-8000-000000000904', 1) $$),
  '23514',
  'a session of the gym''s program does not start while her plan is paused'
);

select lives_ok(
  $$ select pg_temp.start('019bd100-0000-7000-8000-000000000909', 2) $$,
  'her own program starts as always'
);

-- Her coach: reads, does not write, and never learns why.
reset role;
set local role allfit_owner;
select pg_temp.as_coach_member();

select is(pg_temp.can('contribute'), false, 'the policies refuse her coach''s writes');
select is(pg_temp.can('read'), true, 'and still let him read what she shares');

select access_control.open_contract_scope(
  'assignment_administration', '019bd100-0000-7000-8000-000000000811');
select pg_temp.can('contribute');
select is(
  access_control.contract_scope('assignment_administration'),
  '019bd100-0000-7000-8000-000000000811',
  'asking leaves the scope the command had opened as it found it'
);

select is(
  (select count(*)::integer from planning.service_access_blocks),
  0,
  'and the coach reads no block: the commercial cause is not his to know'
);

select pg_temp.as_coach_member();
select is(
  pg_temp.write_assignment(1),
  '42501',
  'a program written straight into the table is refused by its policy'
);

reset role;
set local role allfit_api;
select pg_temp.act('019bd100-0000-7000-8000-000000000002');

select is(
  pg_temp.reschedule('019bd100-0000-7000-8000-000000000904', 11),
  'AF424',
  'moving a session answers that her service is paused'
);

select is(
  pg_temp.failure(format(
    'select * from planning.revise_prescription(%L, %L, %L, %L, %L, %L, null, %L, %L, %L)',
    '019bd100-0000-7000-8000-000000000002', '019bd100-0000-7000-8000-000000000301',
    '019bd100-0000-7000-8000-000000000811', gen_random_uuid(), 'note', '"Despacio"',
    pg_temp.command(12), pg_temp.command(12), extensions.digest('revise', 'sha256'))),
  'AF424',
  'so does adjusting her prescription'
);

select is(
  pg_temp.failure(format(
    'select * from planning.cancel_managed_assignment(%L, %L, %L, %L, %L, %L)',
    '019bd100-0000-7000-8000-000000000002', '019bd100-0000-7000-8000-000000000301',
    '019bd100-0000-7000-8000-000000000811',
    pg_temp.command(13), pg_temp.command(13), extensions.digest('cancel', 'sha256'))),
  'AF424',
  'and stopping the program'
);

select is(
  pg_temp.failure(format(
    'select * from planning.assign_program_from_relationship(%L, %L, %L, %L, %L, %L, %L, %L, %L)',
    '019bd100-0000-7000-8000-000000000002', '019bd100-0000-7000-8000-000000000301',
    '019bd100-0000-7000-8000-000000000321', '019bd100-0000-7000-8000-000000000807',
    (clock_timestamp() at time zone 'UTC')::date, 'UTC',
    pg_temp.command(14), pg_temp.command(14), extensions.digest('assign', 'sha256'))),
  'AF424',
  'and giving her another one'
);

select is(
  (select count(*)::integer from planning.list_relationship_assignments(
    '019bd100-0000-7000-8000-000000000002', '019bd100-0000-7000-8000-000000000301',
    '019bd100-0000-7000-8000-000000000321', 25, null, null)),
  1,
  'while he still reads the program he gave her'
);

-- ---------------------------------------------------------------------------
-- She pays and the gym reactivates it
-- ---------------------------------------------------------------------------

select pg_temp.act('019bd100-0000-7000-8000-000000000001');
select reactivated from payments.reactivate_subscription(
  '019bd100-0000-7000-8000-000000000001', '019bd100-0000-7000-8000-000000000301',
  '019bd100-0000-7000-8000-000000000503', pg_temp.command(21), pg_temp.command(21),
  extensions.digest('reactivate', 'sha256'));

select pg_temp.act('019bd100-0000-7000-8000-000000000008');

select is(
  pg_temp.week_holds(),
  array['none', 'none', 'none', 'none'],
  'reactivated the same day, her week is as it was'
);

select pg_temp.act('019bd100-0000-7000-8000-000000000002');

select is(
  pg_temp.reschedule('019bd100-0000-7000-8000-000000000904', 22),
  'no error',
  'and her coach contributes again, with no new consent'
);

select pg_temp.act('019bd100-0000-7000-8000-000000000008');

select lives_ok(
  $$ select pg_temp.start('019bd100-0000-7000-8000-000000000904', 3) $$,
  'today''s session starts again'
);

reset role;
set local role allfit_owner;
select pg_temp.as_coach_member();

select is(
  pg_temp.write_assignment(2),
  'no error',
  'and the same write through the policy goes through'
);

reset role;

-- A block that holds her sessions and leaves her coach alone.
insert into planning.service_access_blocks (
  id, person_id, organization_id, relationship_id, subscription_id, source_kind,
  blocks_future_sessions, blocks_professional_contribution, created_by_kind,
  created_by_membership_id
) values (
  '019bd100-0000-7000-8000-000000000504', '019bd100-0000-7000-8000-000000000008',
  '019bd100-0000-7000-8000-000000000301', '019bd100-0000-7000-8000-000000000321',
  '019bd100-0000-7000-8000-000000000503', 'subscription_suspension', true, false, 'person',
  '019bd100-0000-7000-8000-000000000311'
);

set local role allfit_owner;
select pg_temp.as_coach_member();
select is(
  pg_temp.can('contribute'),
  true,
  'a block that does not bar contribution leaves her coach contributing'
);
select pg_temp.act('019bd100-0000-7000-8000-000000000008');
select is(
  pg_temp.hold('019bd100-0000-7000-8000-000000000903'),
  'paused/subscription_suspension',
  'while it still holds her sessions'
);

reset role;
update planning.service_access_blocks set ended_at = clock_timestamp()
where id = '019bd100-0000-7000-8000-000000000504';

-- ---------------------------------------------------------------------------
-- A pause that lasted days: Tuesday morning to Thursday morning, last week
-- ---------------------------------------------------------------------------

insert into planning.service_access_blocks (
  person_id, organization_id, relationship_id, subscription_id, source_kind,
  blocks_future_sessions, blocks_professional_contribution, created_by_kind,
  created_by_membership_id, started_at, ended_at
) values (
  '019bd100-0000-7000-8000-000000000008', '019bd100-0000-7000-8000-000000000301',
  '019bd100-0000-7000-8000-000000000321', '019bd100-0000-7000-8000-000000000503',
  'subscription_suspension', true, true, 'person', '019bd100-0000-7000-8000-000000000311',
  (:'monday'::date - 6 + time '10:00') at time zone 'UTC',
  (:'monday'::date - 4 + time '09:00') at time zone 'UTC'
);

set local role allfit_owner;
select pg_temp.act('019bd100-0000-7000-8000-000000000008');

select is(
  array[pg_temp.hold('019bd100-0000-7000-8000-000000000912'),
        pg_temp.hold('019bd100-0000-7000-8000-000000000913')],
  array['missed/subscription_suspension', 'missed/subscription_suspension'],
  'the day it started and the days it lasted are missed, because her plan was paused'
);

select is(
  array[pg_temp.hold('019bd100-0000-7000-8000-000000000911'),
        pg_temp.hold('019bd100-0000-7000-8000-000000000914')],
  array['none', 'none'],
  'the day before and the day it was reactivated are ordinary'
);

reset role;
set local role allfit_api;
select pg_temp.act('019bd100-0000-7000-8000-000000000008');

select is(
  pg_temp.failure($$ select pg_temp.start('019bd100-0000-7000-8000-000000000913', 4) $$),
  '23514',
  'a missed day does not start later'
);

-- Paused again: what was lost stays lost, and the rest waits.
select pg_temp.act('019bd100-0000-7000-8000-000000000001');
select pg_temp.suspend(31);

reset role;
set local role allfit_owner;
select pg_temp.act('019bd100-0000-7000-8000-000000000008');

select is(
  array[pg_temp.hold('019bd100-0000-7000-8000-000000000912'),
        pg_temp.hold('019bd100-0000-7000-8000-000000000915')],
  array['missed/subscription_suspension', 'paused/subscription_suspension'],
  'paused again, a day already missed stays missed and the others are paused'
);

-- ---------------------------------------------------------------------------
-- The relationship ends and begins again while her plan is still paused
-- ---------------------------------------------------------------------------

reset role;
set local role allfit_api;
select pg_temp.act('019bd100-0000-7000-8000-000000000001');

select lives_ok(
  format(
    'select * from relationships.terminate_relationship(%L, %L, %L, %L, %L, %L, %L)',
    '019bd100-0000-7000-8000-000000000001', '019bd100-0000-7000-8000-000000000301',
    '019bd100-0000-7000-8000-000000000321', 'Se fue', pg_temp.command(41),
    pg_temp.command(41), extensions.digest('terminate', 'sha256')),
  'the gym can still end the relationship while her plan is paused'
);

reset role;

insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019bd100-0000-7000-8000-000000000322', '019bd100-0000-7000-8000-000000000008',
  '019bd100-0000-7000-8000-000000000301', 'active');
insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status
) values (
  '019bd100-0000-7000-8000-000000000332', '019bd100-0000-7000-8000-000000000322',
  '019bd100-0000-7000-8000-000000000008', '019bd100-0000-7000-8000-000000000301',
  '019bd100-0000-7000-8000-000000000312', 'holder', 'active'
);
insert into privacy.consent_events (
  id, person_id, relationship_id, organization_id, invitation_scope_option_id,
  scope_definition_id, scope_code, decision, presented_snapshot
) values (
  '019bd100-0000-7000-8000-000000000407', '019bd100-0000-7000-8000-000000000008',
  '019bd100-0000-7000-8000-000000000322', '019bd100-0000-7000-8000-000000000301',
  '019bd100-0000-7000-8000-000000000404', '019bd100-0000-7000-8000-000000000401',
  'relationship_training', 'accepted', '{"title":"Training"}'::jsonb
);
insert into privacy.data_grants (
  id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
  consent_event_id, access_level, purpose
) values (
  '019bd100-0000-7000-8000-000000000408', '019bd100-0000-7000-8000-000000000008',
  '019bd100-0000-7000-8000-000000000322', '019bd100-0000-7000-8000-000000000301',
  '019bd100-0000-7000-8000-000000000401', 'relationship_training',
  '019bd100-0000-7000-8000-000000000407', 'contribute', 'Plan the training'
);

set local role allfit_owner;
select pg_temp.as_coach_member();

select is(
  access_control.can_access(
    '019bd100-0000-7000-8000-000000000322', 'relationship_training', 'contribute'),
  false,
  'a relationship begun while her plan is paused does not let her coach contribute either'
);

reset role;

select * from finish();

rollback;
