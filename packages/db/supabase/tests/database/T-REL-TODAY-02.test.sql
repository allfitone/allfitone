-- T-REL-TODAY-02 — OP-REL-020, the training a coach looks at today (HU-STUDIO-081 c2, c7).
--
-- For each client he attends who shares her training with this relationship:
--
--   · the sessions of her last closed week (ADR-032, Monday to Sunday in her program's
--     timezone) that she has not logged; cancelled and paused ones were never due, and
--     an annulled session is not logged;
--   · what she finished inside the relationship in the last forty-eight hours.
--
-- She appears only when one of the two has something. Every client evaluated leaves one
-- access event, whether she appears or not, since not appearing says something too. A
-- client who withdrew her training is not evaluated, not mentioned and not logged.
begin;

select plan(17);

insert into identity.people (id, given_name, family_name, status)
values
  ('019ae600-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019ae600-0000-7000-8000-000000000002', 'Bea', 'Client', 'active'),
  ('019ae600-0000-7000-8000-000000000003', 'Ciro', 'Client', 'active'),
  ('019ae600-0000-7000-8000-000000000004', 'Dora', 'Client', 'active'),
  ('019ae600-0000-7000-8000-000000000005', 'Eli', 'Client', 'active'),
  ('019ae600-0000-7000-8000-000000000006', 'Fer', 'Client', 'active'),
  ('019ae600-0000-7000-8000-000000000007', 'Kai', 'Client', 'active'),
  ('019ae600-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019ae600-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019ae600-0000-7000-8000-000000000013', 'Diana', 'Coach', 'active'),
  ('019ae600-0000-7000-8000-000000000014', 'Hugo', 'Desk', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019ae600-0000-7000-8000-000000000101', 'gym', 'Gym Semana',
  '{"party_kind":"legal_entity","party_name":"Semana SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019ae600-0000-7000-8000-000000000211', '019ae600-0000-7000-8000-000000000101', '019ae600-0000-7000-8000-000000000011', 'active'),
  ('019ae600-0000-7000-8000-000000000212', '019ae600-0000-7000-8000-000000000101', '019ae600-0000-7000-8000-000000000012', 'active'),
  ('019ae600-0000-7000-8000-000000000213', '019ae600-0000-7000-8000-000000000101', '019ae600-0000-7000-8000-000000000013', 'active'),
  ('019ae600-0000-7000-8000-000000000214', '019ae600-0000-7000-8000-000000000101', '019ae600-0000-7000-8000-000000000014', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019ae600-0000-7000-8000-000000000211', 'owner'),
  ('019ae600-0000-7000-8000-000000000212', 'coach'),
  ('019ae600-0000-7000-8000-000000000213', 'coach'),
  ('019ae600-0000-7000-8000-000000000214', 'coach'),
  ('019ae600-0000-7000-8000-000000000214', 'staff');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
select ('019ae600-0000-7000-8000-00000000070' || n)::uuid, ('019ae600-0000-7000-8000-00000000000' || n)::uuid,
       '019ae600-0000-7000-8000-000000000101', 'active', now() - interval '2 years'
from generate_series(1, 7) as n;

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, valid_from, ends_on, accepted_by_person_at
)
select id, ('019ae600-0000-7000-8000-00000000070' || n)::uuid, ('019ae600-0000-7000-8000-00000000000' || n)::uuid,
       '019ae600-0000-7000-8000-000000000101', membership, covers,
       kind::relationships.assignment_kind, 'active', now() - interval '2 years', ends_on, accepted
from (values
  ('019ae600-0000-7000-8000-000000000801'::uuid, 1, '019ae600-0000-7000-8000-000000000212'::uuid, null::uuid, 'holder', null::date, null::timestamptz),
  ('019ae600-0000-7000-8000-000000000802', 2, '019ae600-0000-7000-8000-000000000212', null, 'holder', null, null),
  ('019ae600-0000-7000-8000-000000000803', 3, '019ae600-0000-7000-8000-000000000212', null, 'holder', null, null),
  ('019ae600-0000-7000-8000-000000000804', 4, '019ae600-0000-7000-8000-000000000212', null, 'holder', null, null),
  ('019ae600-0000-7000-8000-000000000805', 5, '019ae600-0000-7000-8000-000000000213', null, 'holder', null, null),
  -- Camilo's cover of Eli ran out yesterday.
  ('019ae600-0000-7000-8000-000000000815', 5, '019ae600-0000-7000-8000-000000000212', '019ae600-0000-7000-8000-000000000213',
   'substitute', current_date - 1, now() - interval '20 days'),
  ('019ae600-0000-7000-8000-000000000806', 6, '019ae600-0000-7000-8000-000000000213', null, 'holder', null, null),
  ('019ae600-0000-7000-8000-000000000807', 7, '019ae600-0000-7000-8000-000000000212', null, 'holder', null, null)
) as row (id, n, membership, covers, kind, ends_on, accepted);

-- Each of them shares her training with the gym.
insert into privacy.scope_definitions (id, scope_code, version_number, status)
values ('019ae600-0000-7000-8000-000000000301', 'relationship_training', 71, 'draft');
update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id = '019ae600-0000-7000-8000-000000000301';

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
)
select ('019ae600-0000-7000-8000-00000000040' || n)::uuid, '019ae600-0000-7000-8000-000000000101',
       '019ae600-0000-7000-8000-000000000211', 'email', 'client' || n || '@example.test',
       extensions.digest('week-token-' || n, 'sha256'), 1, extensions.digest('week-proposal-' || n, 'sha256'),
       '{"party_kind":"legal_entity","party_name":"Semana SAS","purpose":"studio_operations"}',
       'completed', clock_timestamp() + interval '7 days'
from generate_series(1, 7) as n;
insert into identity.invitation_intents (id, invitation_id, kind, status)
select ('019ae600-0000-7000-8000-00000000050' || n)::uuid, ('019ae600-0000-7000-8000-00000000040' || n)::uuid,
       'service_relationship', 'pending'
from generate_series(1, 7) as n;
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
)
select ('019ae600-0000-7000-8000-00000000060' || n)::uuid, ('019ae600-0000-7000-8000-00000000050' || n)::uuid,
       '019ae600-0000-7000-8000-000000000301', 'relationship_training', 'read', 'Plan the training',
       '{"title":"Shared"}'::jsonb, 'accepted'::privacy.consent_decision, clock_timestamp()
from generate_series(1, 7) as n;
insert into privacy.consent_events (
  id, person_id, relationship_id, organization_id, invitation_scope_option_id,
  scope_definition_id, scope_code, decision, presented_snapshot
)
select ('019ae600-0000-7000-8000-000000000a0' || n)::uuid, ('019ae600-0000-7000-8000-00000000000' || n)::uuid,
       ('019ae600-0000-7000-8000-00000000070' || n)::uuid, '019ae600-0000-7000-8000-000000000101',
       ('019ae600-0000-7000-8000-00000000060' || n)::uuid, '019ae600-0000-7000-8000-000000000301',
       'relationship_training', 'accepted'::privacy.consent_decision, '{"title":"Shared"}'::jsonb
from generate_series(1, 7) as n;
insert into privacy.data_grants (
  id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
  consent_event_id, access_level, purpose
)
select ('019ae600-0000-7000-8000-000000000a0' || n)::uuid, ('019ae600-0000-7000-8000-00000000000' || n)::uuid,
       ('019ae600-0000-7000-8000-00000000070' || n)::uuid, '019ae600-0000-7000-8000-000000000101',
       '019ae600-0000-7000-8000-000000000301', 'relationship_training',
       ('019ae600-0000-7000-8000-000000000a0' || n)::uuid, 'read', 'Plan the training'
from generate_series(1, 7) as n;

-- Dora withdrew hers.
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019ae600-0000-7000-8000-000000000a04';

-- One routine in one program, assigned to each of them by the gym.
insert into planning.session_templates (id, content_scope, owner_organization_id, owner_person_id, author_person_id, discipline_code, status)
values ('019ae600-0000-7000-8000-000000000311', 'organization', '019ae600-0000-7000-8000-000000000101', null,
        '019ae600-0000-7000-8000-000000000012', 'test_strength', 'published');
insert into planning.programs (id, content_scope, owner_organization_id, owner_person_id, author_person_id, status)
values ('019ae600-0000-7000-8000-000000000331', 'organization', '019ae600-0000-7000-8000-000000000101', null,
        '019ae600-0000-7000-8000-000000000012', 'published');
select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
values ('019ae600-0000-7000-8000-000000000312', '019ae600-0000-7000-8000-000000000311', 1, 'test_strength',
        '019c0000-0000-7000-8000-000000000011', 'Fuerza', decode(repeat('e1', 32), 'hex'));
insert into planning.program_versions (id, program_id, version_number, title, content_hash, status, repeats_forever)
values ('019ae600-0000-7000-8000-000000000332', '019ae600-0000-7000-8000-000000000331', 1, 'Bloque',
        decode(repeat('e2', 32), 'hex'), 'published', true);
insert into planning.program_version_sessions (program_version_id, template_version_id, position, week, day)
values ('019ae600-0000-7000-8000-000000000332', '019ae600-0000-7000-8000-000000000312', 1, 1, 1);
select set_config('app.planning_publication', '', true);

insert into planning.program_assignments (id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone, assigned_at, display_order)
select ('019ae600-0000-7000-8000-00000000090' || n)::uuid, ('019ae600-0000-7000-8000-00000000000' || n)::uuid,
       '019ae600-0000-7000-8000-000000000332', ('019ae600-0000-7000-8000-00000000070' || n)::uuid,
       'active', '2025-10-01', 'America/Bogota', now() - interval '1 year', 1
from generate_series(1, 7) as n;
insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id, started_at)
select ('019ae600-0000-7000-8000-00000000090' || n)::uuid, ('019ae600-0000-7000-8000-00000000000' || n)::uuid,
       ('019ae600-0000-7000-8000-00000000070' || n)::uuid, now() - interval '1 year'
from generate_series(1, 7) as n;

select (date_trunc('week', (now() at time zone 'America/Bogota')::date) - interval '7 days')::date as last_week,
       date_trunc('week', (now() at time zone 'America/Bogota')::date)::date as this_week \gset

create function pg_temp.planned(id uuid, n integer, week date, day integer, status text) returns void
language sql as $$
  insert into planning.planned_sessions (id, assignment_id, person_id, template_version_id, scheduled_at, timezone, week_starts_on, program_day, status)
  values (id, ('019ae600-0000-7000-8000-00000000090' || n)::uuid, ('019ae600-0000-7000-8000-00000000000' || n)::uuid,
          '019ae600-0000-7000-8000-000000000312',
          ((week + day - 1)::timestamp + interval '7 hours') at time zone 'America/Bogota',
          'America/Bogota', week, day, status)
$$;

create function pg_temp.trained(id uuid, n integer, ended timestamptz, annulled boolean, inside boolean, planned uuid)
returns void language plpgsql as $$
begin
  insert into execution.executed_sessions (
    id, person_id, activity_type_id, result_contract_id, contract_version, is_autonomous,
    context_relationship_id, context_organization_id, started_at, ended_at, timezone,
    execution_status, validation_status, requested_level, achieved_level, capture_source,
    annulled_at, annulment_reason
  ) values (
    id, ('019ae600-0000-7000-8000-00000000000' || n)::uuid, '019c0000-0000-7000-8000-000000000011',
    '019c0000-0000-7000-8000-000000000031', 1, not inside,
    case when inside then ('019ae600-0000-7000-8000-00000000070' || n)::uuid end,
    case when inside then '019ae600-0000-7000-8000-000000000101'::uuid end,
    ended - interval '1 hour', ended, 'America/Bogota', 'completed',
    case when annulled then 'annulled' else 'valid' end::execution.validation_status,
    'detailed', 'detailed', 'manual',
    case when annulled then ended + interval '5 minutes' end,
    case when annulled then 'Duplicada' end
  );
  if planned is not null then
    insert into execution.planned_session_executions (planned_session_id, executed_session_id, person_id, attempt_number, is_primary)
    values (planned, id, ('019ae600-0000-7000-8000-00000000000' || n)::uuid, 1, true);
  end if;
end
$$;

-- Ana, last week: one logged, one not, one cancelled, one paused. One unlogged this
-- week and one the week before, which are not the closed week.
select pg_temp.planned('019ae600-0000-7000-8000-000000000c11', 1, :'last_week', 1, 'completed');
select pg_temp.planned('019ae600-0000-7000-8000-000000000c12', 1, :'last_week', 2, 'scheduled');
select pg_temp.planned('019ae600-0000-7000-8000-000000000c13', 1, :'last_week', 3, 'cancelled');
select pg_temp.planned('019ae600-0000-7000-8000-000000000c14', 1, :'last_week', 4, 'paused');
select pg_temp.planned('019ae600-0000-7000-8000-000000000c15', 1, :'this_week', 1, 'scheduled');
select pg_temp.planned('019ae600-0000-7000-8000-000000000c16', 1, (:'last_week'::date - 7), 1, 'scheduled');
select pg_temp.trained('019ae600-0000-7000-8000-000000000e11', 1,
  ((:'last_week'::date)::timestamp + interval '8 hours') at time zone 'America/Bogota', false, true,
  '019ae600-0000-7000-8000-000000000c11');

-- Bea, last week: one she logged and annulled, one she never logged. Lately: a session two
-- hours ago, one three days ago, one annulled and one trained alone.
select pg_temp.planned('019ae600-0000-7000-8000-000000000c21', 2, :'last_week', 1, 'completed');
select pg_temp.planned('019ae600-0000-7000-8000-000000000c22', 2, :'last_week', 3, 'scheduled');
select pg_temp.trained('019ae600-0000-7000-8000-000000000e21', 2,
  ((:'last_week'::date)::timestamp + interval '8 hours') at time zone 'America/Bogota', true, true,
  '019ae600-0000-7000-8000-000000000c21');
select pg_temp.trained('019ae600-0000-7000-8000-000000000e22', 2, clock_timestamp() - interval '2 hours', false, true, null);
select pg_temp.trained('019ae600-0000-7000-8000-000000000e23', 2, clock_timestamp() - interval '3 days', false, true, null);
select pg_temp.trained('019ae600-0000-7000-8000-000000000e24', 2, clock_timestamp() - interval '1 hour', true, true, null);
select pg_temp.trained('019ae600-0000-7000-8000-000000000e25', 2, clock_timestamp() - interval '1 hour', false, false, null);
select to_jsonb(ended_at) as bea_last from execution.executed_sessions
where id = '019ae600-0000-7000-8000-000000000e22' \gset

-- Ciro logged all of it; Dora, Eli and Fer did not, but are not Camilo's to look at.
select pg_temp.planned('019ae600-0000-7000-8000-000000000c31', 3, :'last_week', 1, 'completed');
select pg_temp.trained('019ae600-0000-7000-8000-000000000e31', 3,
  ((:'last_week'::date)::timestamp + interval '8 hours') at time zone 'America/Bogota', false, true,
  '019ae600-0000-7000-8000-000000000c31');
select pg_temp.planned('019ae600-0000-7000-8000-000000000c41', 4, :'last_week', 1, 'scheduled');
select pg_temp.planned('019ae600-0000-7000-8000-000000000c51', 5, :'last_week', 1, 'scheduled');
select pg_temp.planned('019ae600-0000-7000-8000-000000000c61', 6, :'last_week', 1, 'scheduled');

-- Kai: one unlogged in the week of 2025-10-20 and one in the week of 2025-10-27.
select pg_temp.planned('019ae600-0000-7000-8000-000000000c71', 7, '2025-10-20', 3, 'scheduled');
select pg_temp.planned('019ae600-0000-7000-8000-000000000c72', 7, '2025-10-27', 3, 'scheduled');

create function pg_temp.act(person uuid, request uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_token', '', true);
  perform set_config('app.request_id', coalesce(request::text, ''), true);
end
$$;

set local role allfit_api;
select pg_temp.act('019ae600-0000-7000-8000-000000000012', '019ae600-0000-7000-8000-00000000b001');
select relationships.read_studio_today(
  '019ae600-0000-7000-8000-000000000012', '019ae600-0000-7000-8000-000000000101')->'notices'->'training' as camilo \gset

select is(
  (:'camilo'::jsonb)->'count',
  '2'::jsonb,
  'two of his clients need a look: what Ciro logged and what the others are not his say nothing'
);

select is(
  (select array_agg(item->>'display_name') from jsonb_array_elements((:'camilo'::jsonb)->'items') as item),
  array['Bea Client', 'Ana Client'],
  'the one with more left unlogged first'
);

select is(
  (:'camilo'::jsonb)->'items'->1,
  jsonb_build_object(
    'person_id', '019ae600-0000-7000-8000-000000000001',
    'display_name', 'Ana Client',
    'relationship_id', '019ae600-0000-7000-8000-000000000701',
    'closed_week', jsonb_build_object('week_starts_on', :'last_week', 'planned', 2, 'not_logged', 1),
    'recent_results', jsonb_build_object('count', 0, 'last_ended_at', null)),
  'Ana left one of two unlogged last week; cancelled and paused sessions were never due'
);

select is(
  (:'camilo'::jsonb)->'items'->0->'closed_week',
  jsonb_build_object('week_starts_on', :'last_week', 'planned', 2, 'not_logged', 2),
  'a session she annulled is not logged'
);

select is(
  (:'camilo'::jsonb)->'items'->0->'recent_results',
  jsonb_build_object('count', 1, 'last_ended_at', :'bea_last'::jsonb),
  'what she finished inside the relationship in two days counts; older, annulled or alone does not'
);

select ok(
  current_setting('app.contract_scope_id', true) = ''
  and current_setting('app.contract_scope_purpose', true) = '',
  'no screening scope stays open after the read'
);

reset role;

select is(
  (select array_agg(subject_person_id::text order by subject_person_id)
     from privacy.access_events where request_id = '019ae600-0000-7000-8000-00000000b001'),
  array['019ae600-0000-7000-8000-000000000001', '019ae600-0000-7000-8000-000000000002',
        '019ae600-0000-7000-8000-000000000003', '019ae600-0000-7000-8000-000000000007'],
  'one access event for every client evaluated, shown or not; none for whom he may not read'
);

select is(
  (select array_agg(distinct row(actor_person_id, actor_membership_id, scope_code, scope_version,
                                  access_mode, resource, purpose, result)::text)
     from privacy.access_events where request_id = '019ae600-0000-7000-8000-00000000b001'),
  array[row('019ae600-0000-7000-8000-000000000012'::uuid, '019ae600-0000-7000-8000-000000000212'::uuid,
            'relationship_training', 71, 'live'::privacy.access_mode, 'relationships.studio_today',
            'studio_attention_today', 'allowed')::text],
  'each names him, his membership, the category and its version she accepted'
);

select is(
  (select count(*) from privacy.access_events as event
    join privacy.data_grants as shared on shared.id = event.data_grant_id
     and shared.relationship_id = event.relationship_id
    where event.request_id = '019ae600-0000-7000-8000-00000000b001'),
  4::bigint,
  'and the grant it read under, of that very relationship'
);

set local role allfit_api;
select pg_temp.act('019ae600-0000-7000-8000-000000000013', '019ae600-0000-7000-8000-00000000b002');
select is(
  (select array_agg(item->>'display_name')
     from jsonb_array_elements(relationships.read_studio_today(
       '019ae600-0000-7000-8000-000000000013', '019ae600-0000-7000-8000-000000000101')->'notices'->'training'->'items') as item),
  array['Eli Client', 'Fer Client'],
  'Diana looks at the clients she holds, including the one Camilo covered until yesterday'
);

-- Hugo also works the desk, so he sees every client in the directory, and attends none.
select pg_temp.act('019ae600-0000-7000-8000-000000000014', '019ae600-0000-7000-8000-00000000b004');
select is(
  relationships.read_studio_today(
    '019ae600-0000-7000-8000-000000000014', '019ae600-0000-7000-8000-000000000101')
    ->'notices'->'training',
  '{"count": 0, "items": []}'::jsonb,
  'seeing the directory from the desk is not attending: he looks at nobody''s training'
);

reset role;
select is(
  (select count(*) from privacy.access_events
    where request_id = '019ae600-0000-7000-8000-00000000b004'),
  0::bigint,
  'and nobody''s access log says he did'
);
set local role allfit_api;

select pg_temp.act('019ae600-0000-7000-8000-000000000012', null);
select throws_ok(
  $$select relationships.read_studio_today(
    '019ae600-0000-7000-8000-000000000012', '019ae600-0000-7000-8000-000000000101')$$,
  '22023', 'request id required for audited read',
  'reading training without a request to log it under is refused'
);

select pg_temp.act('019ae600-0000-7000-8000-000000000011', null);
select lives_ok(
  $$select relationships.read_studio_today(
    '019ae600-0000-7000-8000-000000000011', '019ae600-0000-7000-8000-000000000101')$$,
  'an owner reads no training, so needs none'
);

reset role;

-- Monday 2025-11-03 at 02:00 UTC is still Sunday evening in Bogotá: the closed week
-- there began on 2025-10-20, not on 2025-10-27.
set local role allfit_owner;
select pg_temp.act('019ae600-0000-7000-8000-000000000012', '019ae600-0000-7000-8000-00000000b003');
select set_config('app.actor_org_id', '019ae600-0000-7000-8000-000000000101', true);
select set_config('app.actor_membership_id', '019ae600-0000-7000-8000-000000000212', true);
select set_config('app.purpose', 'studio_attention_today', true);
select is(
  (select row(week_starts_on, planned, not_logged)::text
     from relationships.today_training('019ae600-0000-7000-8000-000000000101', '2025-11-03T02:00:00Z')
    where person_id = '019ae600-0000-7000-8000-000000000007'),
  row('2025-10-20'::date, 1, 1)::text,
  'the week closes in her timezone, not in UTC'
);
reset role;

select ok(
  has_function_privilege('allfit_api', 'relationships.read_studio_today(uuid, uuid)', 'execute'),
  'the API reads the summary'
);

select ok(
  not has_function_privilege('allfit_api',
    'relationships.today_training(uuid, timestamptz)', 'execute'),
  'but never runs the training evaluation by itself'
);

select * from finish();

rollback;
