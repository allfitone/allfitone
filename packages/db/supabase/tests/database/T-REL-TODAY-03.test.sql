-- T-REL-TODAY-03 — OP-REL-020, how the organization is doing (HU-STUDIO-081).
--
-- Beside what waits, the read says how things go, and only to whom may know:
--
--   · `training_adherence` (observe_training): what the clients a coach attends had
--     due and logged over their last eight closed weeks, summed. A week closes in the
--     program's timezone (ADR-032). Cancelled and paused sessions were never due, an
--     annulled one is not logged, and neither is one she hid from this relationship.
--     It is worked out in the look the notice already takes, so it writes no access
--     event of its own; a client who withdrew her training is not summed.
--   · `relationship_changes` (view_directory): relationships begun and ended in each
--     of the last six months of the viewer's timezone, and absent without one.
--   · `professional_load` (assign_professionals): the clients each coach holds, the
--     ones with none included. A cover holds nobody.
--
-- An indicator the caller's roles do not open is absent, and none of them is work
-- waiting. The week and month cuts are proven with a clock handed in, never the wall's.
begin;

select plan(27);

insert into identity.people (id, given_name, family_name, status)
values
  ('019ae900-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019ae900-0000-7000-8000-000000000002', 'Bea', 'Client', 'active'),
  ('019ae900-0000-7000-8000-000000000003', 'Ciro', 'Client', 'active'),
  ('019ae900-0000-7000-8000-000000000004', 'Dora', 'Client', 'active'),
  ('019ae900-0000-7000-8000-000000000005', 'Eli', 'Client', 'active'),
  ('019ae900-0000-7000-8000-000000000006', 'Fer', 'Client', 'active'),
  ('019ae900-0000-7000-8000-000000000007', 'Gil', 'Client', 'active'),
  ('019ae900-0000-7000-8000-000000000008', 'Hana', 'Client', 'active'),
  ('019ae900-0000-7000-8000-000000000009', 'Iris', 'Client', 'active'),
  ('019ae900-0000-7000-8000-000000000010', 'Juan', 'Client', 'active'),
  ('019ae900-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019ae900-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019ae900-0000-7000-8000-000000000013', 'Diana', 'Coach', 'active'),
  ('019ae900-0000-7000-8000-000000000014', 'Sara', 'Staff', 'active'),
  ('019ae900-0000-7000-8000-000000000015', 'Nora', 'Former', 'active'),
  ('019ae900-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active'),
  ('019ae900-0000-7000-8000-000000000017', 'Tomas', 'Coach', 'active'),
  ('019ae900-0000-7000-8000-000000000018', 'Lola', 'Left', 'active'),
  ('019ae900-0000-7000-8000-000000000019', 'Otto', 'Elsewhere', 'active'),
  ('019ae900-0000-7000-8000-000000000020', 'Kim', 'Elsewhere', 'active'),
  ('019ae900-0000-7000-8000-000000000021', 'Pablo', 'Large', 'active');

-- Thirteen coaches for a gym that lists twelve.
insert into identity.people (id, given_name, family_name, status)
select ('019ae900-0000-7000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'Coach', lpad(n::text, 2, '0'), 'active'
from generate_series(1, 13) as n;

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019ae900-0000-7000-8000-000000000a01', 'gym', 'Gym Ritmo',
   '{"party_kind":"legal_entity","party_name":"Ritmo SAS","purpose":"studio_operations"}'),
  ('019ae900-0000-7000-8000-000000000a02', 'gym', 'Gym Otro',
   '{"party_kind":"legal_entity","party_name":"Otro SAS","purpose":"studio_operations"}'),
  ('019ae900-0000-7000-8000-000000000a03', 'gym', 'Gym Grande',
   '{"party_kind":"legal_entity","party_name":"Grande SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status, ended_at)
values
  ('019ae900-0000-7000-8000-000000000211', '019ae900-0000-7000-8000-000000000a01', '019ae900-0000-7000-8000-000000000011', 'active', null),
  ('019ae900-0000-7000-8000-000000000212', '019ae900-0000-7000-8000-000000000a01', '019ae900-0000-7000-8000-000000000012', 'active', null),
  ('019ae900-0000-7000-8000-000000000213', '019ae900-0000-7000-8000-000000000a01', '019ae900-0000-7000-8000-000000000013', 'active', null),
  ('019ae900-0000-7000-8000-000000000214', '019ae900-0000-7000-8000-000000000a01', '019ae900-0000-7000-8000-000000000014', 'active', null),
  ('019ae900-0000-7000-8000-000000000215', '019ae900-0000-7000-8000-000000000a01', '019ae900-0000-7000-8000-000000000015', 'active', null),
  ('019ae900-0000-7000-8000-000000000216', '019ae900-0000-7000-8000-000000000a01', '019ae900-0000-7000-8000-000000000016', 'active', null),
  ('019ae900-0000-7000-8000-000000000217', '019ae900-0000-7000-8000-000000000a01', '019ae900-0000-7000-8000-000000000017', 'active', null),
  -- Lola left the gym; her role was never closed.
  ('019ae900-0000-7000-8000-000000000218', '019ae900-0000-7000-8000-000000000a01', '019ae900-0000-7000-8000-000000000018', 'terminated', now() - interval '1 day'),
  ('019ae900-0000-7000-8000-000000000221', '019ae900-0000-7000-8000-000000000a02', '019ae900-0000-7000-8000-000000000019', 'active', null),
  ('019ae900-0000-7000-8000-000000000231', '019ae900-0000-7000-8000-000000000a03', '019ae900-0000-7000-8000-000000000021', 'active', null);
insert into organizations.organization_memberships (id, organization_id, person_id, status)
select ('019ae900-0000-7000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid, '019ae900-0000-7000-8000-000000000a03',
       ('019ae900-0000-7000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'active'
from generate_series(1, 13) as n;

insert into organizations.membership_roles (membership_id, role_code, valid_from, valid_to)
values
  ('019ae900-0000-7000-8000-000000000211', 'owner', now() - interval '3 years', null),
  ('019ae900-0000-7000-8000-000000000212', 'coach', now() - interval '3 years', null),
  ('019ae900-0000-7000-8000-000000000213', 'coach', now() - interval '3 years', null),
  ('019ae900-0000-7000-8000-000000000214', 'staff', now() - interval '3 years', null),
  -- Nora is still a member, with no role in force.
  ('019ae900-0000-7000-8000-000000000215', 'coach', now() - interval '3 years', now() - interval '1 day'),
  ('019ae900-0000-7000-8000-000000000216', 'admin', now() - interval '3 years', null),
  ('019ae900-0000-7000-8000-000000000217', 'coach', now() - interval '3 years', null),
  ('019ae900-0000-7000-8000-000000000218', 'coach', now() - interval '3 years', null),
  ('019ae900-0000-7000-8000-000000000221', 'coach', now() - interval '3 years', null),
  ('019ae900-0000-7000-8000-000000000231', 'owner', now() - interval '3 years', null);
insert into organizations.membership_roles (membership_id, role_code)
select ('019ae900-0000-7000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid, 'coach'
from generate_series(1, 13) as n;

-- Ana to Eli have been clients for years. The rest came and went on dates that fall in
-- one month in Bogotá and in another in UTC.
insert into relationships.service_relationships (id, person_id, organization_id, status, started_at, ended_at)
select id, person, organization, status::relationships.relationship_status, started, ended
from (values
  ('019ae900-0000-7000-8000-000000000701'::uuid, '019ae900-0000-7000-8000-000000000001'::uuid, '019ae900-0000-7000-8000-000000000a01'::uuid, 'active', now() - interval '2 years', null::timestamptz),
  ('019ae900-0000-7000-8000-000000000702', '019ae900-0000-7000-8000-000000000002', '019ae900-0000-7000-8000-000000000a01', 'active', now() - interval '2 years', null),
  ('019ae900-0000-7000-8000-000000000703', '019ae900-0000-7000-8000-000000000003', '019ae900-0000-7000-8000-000000000a01', 'active', now() - interval '2 years', null),
  ('019ae900-0000-7000-8000-000000000704', '019ae900-0000-7000-8000-000000000004', '019ae900-0000-7000-8000-000000000a01', 'active', now() - interval '2 years', null),
  ('019ae900-0000-7000-8000-000000000705', '019ae900-0000-7000-8000-000000000005', '019ae900-0000-7000-8000-000000000a01', 'active', now() - interval '2 years', null),
  -- Fer: 30 September at 22:00 in Bogotá, 1 October in UTC.
  ('019ae900-0000-7000-8000-000000000706', '019ae900-0000-7000-8000-000000000006', '019ae900-0000-7000-8000-000000000a01', 'active', '2025-10-01T03:00:00Z', null),
  ('019ae900-0000-7000-8000-000000000707', '019ae900-0000-7000-8000-000000000007', '019ae900-0000-7000-8000-000000000a01', 'terminated', '2025-08-10T15:00:00Z', '2025-09-20T15:00:00Z'),
  -- Hana: began on 30 April in Bogotá and left on 31 May there, 1 June in UTC.
  ('019ae900-0000-7000-8000-000000000708', '019ae900-0000-7000-8000-000000000008', '019ae900-0000-7000-8000-000000000a01', 'terminated', '2025-05-01T04:00:00Z', '2025-06-01T02:00:00Z'),
  ('019ae900-0000-7000-8000-000000000709', '019ae900-0000-7000-8000-000000000009', '019ae900-0000-7000-8000-000000000a01', 'active', '2025-10-31T23:00:00Z', null),
  -- Juan: 31 October at 20:00 in Bogotá, 1 November in UTC.
  ('019ae900-0000-7000-8000-000000000710', '019ae900-0000-7000-8000-000000000010', '019ae900-0000-7000-8000-000000000a01', 'active', '2025-11-01T01:00:00Z', null),
  ('019ae900-0000-7000-8000-000000000711', '019ae900-0000-7000-8000-000000000020', '019ae900-0000-7000-8000-000000000a02', 'active', '2025-09-15T15:00:00Z', null)
) as relationship (id, person, organization, status, started, ended);

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, valid_from, valid_to, ends_on, accepted_by_person_at
)
select id, relationship, person, organization, membership, covers,
       kind::relationships.assignment_kind, status::relationships.assignment_status,
       valid_from, valid_to, ends_on, accepted
from (values
  ('019ae900-0000-7000-8000-000000000801'::uuid, '019ae900-0000-7000-8000-000000000701'::uuid, '019ae900-0000-7000-8000-000000000001'::uuid, '019ae900-0000-7000-8000-000000000a01'::uuid,
   '019ae900-0000-7000-8000-000000000212'::uuid, null::uuid, 'holder', 'active', now() - interval '2 years', null::timestamptz, null::date, null::timestamptz),
  ('019ae900-0000-7000-8000-000000000802', '019ae900-0000-7000-8000-000000000702', '019ae900-0000-7000-8000-000000000002', '019ae900-0000-7000-8000-000000000a01',
   '019ae900-0000-7000-8000-000000000212', null, 'holder', 'active', now() - interval '2 years', null, null, null),
  ('019ae900-0000-7000-8000-000000000803', '019ae900-0000-7000-8000-000000000703', '019ae900-0000-7000-8000-000000000003', '019ae900-0000-7000-8000-000000000a01',
   '019ae900-0000-7000-8000-000000000212', null, 'holder', 'active', now() - interval '2 years', null, null, null),
  ('019ae900-0000-7000-8000-000000000804', '019ae900-0000-7000-8000-000000000704', '019ae900-0000-7000-8000-000000000004', '019ae900-0000-7000-8000-000000000a01',
   '019ae900-0000-7000-8000-000000000212', null, 'holder', 'active', now() - interval '2 years', null, null, null),
  ('019ae900-0000-7000-8000-000000000805', '019ae900-0000-7000-8000-000000000705', '019ae900-0000-7000-8000-000000000005', '019ae900-0000-7000-8000-000000000a01',
   '019ae900-0000-7000-8000-000000000213', null, 'holder', 'active', now() - interval '2 years', null, null, null),
  -- Fer: Tomas held her until five days ago, and nobody since.
  ('019ae900-0000-7000-8000-000000000806', '019ae900-0000-7000-8000-000000000706', '019ae900-0000-7000-8000-000000000006', '019ae900-0000-7000-8000-000000000a01',
   '019ae900-0000-7000-8000-000000000217', null, 'holder', 'ended', now() - interval '40 days', now() - interval '5 days', null, null),
  -- Iris: Diana holds her and Tomas covers Diana, which is holding nobody.
  ('019ae900-0000-7000-8000-000000000809', '019ae900-0000-7000-8000-000000000709', '019ae900-0000-7000-8000-000000000009', '019ae900-0000-7000-8000-000000000a01',
   '019ae900-0000-7000-8000-000000000213', null, 'holder', 'active', now() - interval '30 days', null, null, null),
  ('019ae900-0000-7000-8000-000000000819', '019ae900-0000-7000-8000-000000000709', '019ae900-0000-7000-8000-000000000009', '019ae900-0000-7000-8000-000000000a01',
   '019ae900-0000-7000-8000-000000000217', '019ae900-0000-7000-8000-000000000213', 'substitute', 'active',
   now() - interval '4 days', null, current_date + 5, now() - interval '4 days'),
  ('019ae900-0000-7000-8000-000000000811', '019ae900-0000-7000-8000-000000000711', '019ae900-0000-7000-8000-000000000020', '019ae900-0000-7000-8000-000000000a02',
   '019ae900-0000-7000-8000-000000000221', null, 'holder', 'active', now() - interval '30 days', null, null, null)
) as row (id, relationship, person, organization, membership, covers, kind, status, valid_from, valid_to, ends_on, accepted);

-- Ana to Eli share their training with the gym; Bea also what she trained on her own.
insert into privacy.scope_definitions (id, scope_code, version_number, status)
values
  ('019ae900-0000-7000-8000-000000000301', 'relationship_training', 91, 'draft'),
  ('019ae900-0000-7000-8000-000000000302', 'prior_training_history', 91, 'draft');
update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id in ('019ae900-0000-7000-8000-000000000301', '019ae900-0000-7000-8000-000000000302');

create temp table shared (n integer, scope text, definition uuid, suffix text) on commit drop;
insert into shared
select n, 'relationship_training', '019ae900-0000-7000-8000-000000000301'::uuid, n::text
from generate_series(1, 5) as n
union all
select 2, 'prior_training_history', '019ae900-0000-7000-8000-000000000302'::uuid, '9';

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
)
select ('019ae900-0000-7000-8000-00000000040' || n)::uuid, '019ae900-0000-7000-8000-000000000a01',
       '019ae900-0000-7000-8000-000000000211', 'email', 'client' || n || '@example.test',
       extensions.digest('ritmo-token-' || n, 'sha256'), 1, extensions.digest('ritmo-proposal-' || n, 'sha256'),
       '{"party_kind":"legal_entity","party_name":"Ritmo SAS","purpose":"studio_operations"}',
       'completed', clock_timestamp() + interval '7 days'
from generate_series(1, 5) as n;
insert into identity.invitation_intents (id, invitation_id, kind, status)
select ('019ae900-0000-7000-8000-00000000050' || n)::uuid, ('019ae900-0000-7000-8000-00000000040' || n)::uuid,
       'service_relationship', 'pending'
from generate_series(1, 5) as n;
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
)
select ('019ae900-0000-7000-8000-00000000060' || suffix)::uuid, ('019ae900-0000-7000-8000-00000000050' || n)::uuid,
       definition, scope, 'read', 'Plan the training',
       '{"title":"Shared"}'::jsonb, 'accepted'::privacy.consent_decision, clock_timestamp()
from shared;
insert into privacy.consent_events (
  id, person_id, relationship_id, organization_id, invitation_scope_option_id,
  scope_definition_id, scope_code, decision, presented_snapshot
)
select ('019ae900-0000-7000-8000-000000000b0' || suffix)::uuid, ('019ae900-0000-7000-8000-00000000000' || n)::uuid,
       ('019ae900-0000-7000-8000-00000000070' || n)::uuid, '019ae900-0000-7000-8000-000000000a01',
       ('019ae900-0000-7000-8000-00000000060' || suffix)::uuid, definition, scope,
       'accepted'::privacy.consent_decision, '{"title":"Shared"}'::jsonb
from shared;
insert into privacy.data_grants (
  id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
  consent_event_id, access_level, purpose
)
select ('019ae900-0000-7000-8000-000000000b0' || suffix)::uuid, ('019ae900-0000-7000-8000-00000000000' || n)::uuid,
       ('019ae900-0000-7000-8000-00000000070' || n)::uuid, '019ae900-0000-7000-8000-000000000a01',
       definition, scope, ('019ae900-0000-7000-8000-000000000b0' || suffix)::uuid, 'read', 'Plan the training'
from shared;

-- Dora withdrew hers.
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019ae900-0000-7000-8000-000000000b04';

-- One routine in one program, assigned to each of them by the gym.
insert into planning.session_templates (id, content_scope, owner_organization_id, owner_person_id, author_person_id, discipline_code, status)
values ('019ae900-0000-7000-8000-000000000311', 'organization', '019ae900-0000-7000-8000-000000000a01', null,
        '019ae900-0000-7000-8000-000000000012', 'test_strength', 'published');
insert into planning.programs (id, content_scope, owner_organization_id, owner_person_id, author_person_id, status)
values ('019ae900-0000-7000-8000-000000000331', 'organization', '019ae900-0000-7000-8000-000000000a01', null,
        '019ae900-0000-7000-8000-000000000012', 'published');
select set_config('app.planning_publication', 'true', true);
insert into planning.session_template_versions (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
values ('019ae900-0000-7000-8000-000000000312', '019ae900-0000-7000-8000-000000000311', 1, 'test_strength',
        '019c0000-0000-7000-8000-000000000011', 'Fuerza', decode(repeat('f1', 32), 'hex'));
insert into planning.program_versions (id, program_id, version_number, title, content_hash, status, repeats_forever)
values ('019ae900-0000-7000-8000-000000000332', '019ae900-0000-7000-8000-000000000331', 1, 'Bloque',
        decode(repeat('f2', 32), 'hex'), 'published', true);
insert into planning.program_version_sessions (program_version_id, template_version_id, position, week, day)
values ('019ae900-0000-7000-8000-000000000332', '019ae900-0000-7000-8000-000000000312', 1, 1, 1);
select set_config('app.planning_publication', '', true);

insert into planning.program_assignments (id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone, assigned_at, display_order)
select ('019ae900-0000-7000-8000-00000000090' || n)::uuid, ('019ae900-0000-7000-8000-00000000000' || n)::uuid,
       '019ae900-0000-7000-8000-000000000332', ('019ae900-0000-7000-8000-00000000070' || n)::uuid,
       'active', '2025-08-01', 'America/Bogota', now() - interval '18 months', 1
from generate_series(1, 5) as n;
insert into planning.assignment_management_periods (assignment_id, person_id, relationship_id, started_at)
select ('019ae900-0000-7000-8000-00000000090' || n)::uuid, ('019ae900-0000-7000-8000-00000000000' || n)::uuid,
       ('019ae900-0000-7000-8000-00000000070' || n)::uuid, now() - interval '18 months'
from generate_series(1, 5) as n;

create function pg_temp.planned(
  id uuid, n integer, week date, day integer, status text, zone text default 'America/Bogota'
) returns void
language sql as $$
  insert into planning.planned_sessions (id, assignment_id, person_id, template_version_id, scheduled_at, timezone, week_starts_on, program_day, status)
  values (id, ('019ae900-0000-7000-8000-00000000090' || n)::uuid, ('019ae900-0000-7000-8000-00000000000' || n)::uuid,
          '019ae900-0000-7000-8000-000000000312',
          ((week + day - 1)::timestamp + interval '7 hours') at time zone zone,
          zone, week, day, status)
$$;

-- What she trained on a planned session: inside the relationship, or on her own.
create function pg_temp.trained(id uuid, n integer, planned uuid, annulled boolean default false, inside boolean default true)
returns void language plpgsql as $$
declare
  ended timestamptz;
begin
  select scheduled_at + interval '1 hour' into ended from planning.planned_sessions where planned_sessions.id = planned;
  insert into execution.executed_sessions (
    id, person_id, activity_type_id, result_contract_id, contract_version, is_autonomous,
    context_relationship_id, context_organization_id, started_at, ended_at, timezone,
    execution_status, validation_status, requested_level, achieved_level, capture_source,
    annulled_at, annulment_reason
  ) values (
    id, ('019ae900-0000-7000-8000-00000000000' || n)::uuid, '019c0000-0000-7000-8000-000000000011',
    '019c0000-0000-7000-8000-000000000031', 1, not inside,
    case when inside then ('019ae900-0000-7000-8000-00000000070' || n)::uuid end,
    case when inside then '019ae900-0000-7000-8000-000000000a01'::uuid end,
    ended - interval '1 hour', ended, 'America/Bogota', 'completed',
    case when annulled then 'annulled' else 'valid' end::execution.validation_status,
    'detailed', 'detailed', 'manual',
    case when annulled then ended + interval '5 minutes' end,
    case when annulled then 'Duplicada' end
  );
  insert into execution.planned_session_executions (planned_session_id, executed_session_id, person_id, attempt_number, is_primary)
  values (planned, id, ('019ae900-0000-7000-8000-00000000000' || n)::uuid, 1, true);
end
$$;

-- Ana. Week of 20 October: one logged, one not, one cancelled, one paused. Week of the
-- 13th: one logged. Week of 1 September: one not. Week of 25 August, logged, is a ninth
-- week back; week of 27 October, logged, is still open in Bogotá on Sunday evening.
select pg_temp.planned('019ae900-0000-7000-8000-000000000c11', 1, '2025-10-20', 1, 'completed');
select pg_temp.planned('019ae900-0000-7000-8000-000000000c12', 1, '2025-10-20', 2, 'scheduled');
select pg_temp.planned('019ae900-0000-7000-8000-000000000c13', 1, '2025-10-20', 3, 'cancelled');
select pg_temp.planned('019ae900-0000-7000-8000-000000000c14', 1, '2025-10-20', 4, 'paused');
select pg_temp.planned('019ae900-0000-7000-8000-000000000c15', 1, '2025-10-13', 1, 'completed');
select pg_temp.planned('019ae900-0000-7000-8000-000000000c16', 1, '2025-09-01', 1, 'scheduled');
select pg_temp.planned('019ae900-0000-7000-8000-000000000c17', 1, '2025-08-25', 1, 'completed');
select pg_temp.planned('019ae900-0000-7000-8000-000000000c18', 1, '2025-10-27', 1, 'completed');
select pg_temp.trained('019ae900-0000-7000-8000-000000000e11', 1, '019ae900-0000-7000-8000-000000000c11');
select pg_temp.trained('019ae900-0000-7000-8000-000000000e15', 1, '019ae900-0000-7000-8000-000000000c15');
select pg_temp.trained('019ae900-0000-7000-8000-000000000e17', 1, '019ae900-0000-7000-8000-000000000c17');
select pg_temp.trained('019ae900-0000-7000-8000-000000000e18', 1, '019ae900-0000-7000-8000-000000000c18');

-- Bea. Week of 20 October: one she logged and annulled. Week of the 6th: two she trained
-- on her own, which she shares.
select pg_temp.planned('019ae900-0000-7000-8000-000000000c21', 2, '2025-10-20', 1, 'completed');
select pg_temp.planned('019ae900-0000-7000-8000-000000000c22', 2, '2025-10-06', 1, 'completed');
select pg_temp.planned('019ae900-0000-7000-8000-000000000c23', 2, '2025-10-06', 2, 'completed');
select pg_temp.trained('019ae900-0000-7000-8000-000000000e21', 2, '019ae900-0000-7000-8000-000000000c21', true);
select pg_temp.trained('019ae900-0000-7000-8000-000000000e22', 2, '019ae900-0000-7000-8000-000000000c22', false, false);
select pg_temp.trained('019ae900-0000-7000-8000-000000000e23', 2, '019ae900-0000-7000-8000-000000000c23', false, false);

-- Ciro logged one session three weeks before this one, whenever this test runs. In 2025
-- he trained in Tokyo, where the week of 27 October closed half a day before Bogotá's.
select (date_trunc('week', now() at time zone 'America/Bogota'))::date - 21 as three_back \gset
select pg_temp.planned('019ae900-0000-7000-8000-000000000c31', 3, :'three_back', 1, 'completed');
select pg_temp.trained('019ae900-0000-7000-8000-000000000e31', 3, '019ae900-0000-7000-8000-000000000c31');
select pg_temp.planned('019ae900-0000-7000-8000-000000000c32', 3, '2025-10-27', 1, 'completed', 'Asia/Tokyo');
select pg_temp.trained('019ae900-0000-7000-8000-000000000e32', 3, '019ae900-0000-7000-8000-000000000c32');

-- Dora and Eli left one unlogged; neither is Camilo's to sum.
select pg_temp.planned('019ae900-0000-7000-8000-000000000c41', 4, '2025-10-20', 1, 'scheduled');
select pg_temp.planned('019ae900-0000-7000-8000-000000000c51', 5, '2025-10-20', 1, 'scheduled');

create function pg_temp.act(person uuid, request uuid, zone text default null) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_token', '', true);
  perform set_config('app.request_id', request::text, true);
  perform set_config('app.viewer_timezone', coalesce(zone, ''), true);
end
$$;

-- The read as the API runs it.
create function pg_temp.today(
  person uuid, zone text default null,
  organization uuid default '019ae900-0000-7000-8000-000000000a01',
  request uuid default '019ae900-0000-7000-8000-00000000d000'
) returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(person, request, zone);
  return relationships.read_studio_today(person, organization);
end
$$;

create function pg_temp.keys(document jsonb) returns text[] language sql as $$
  select coalesce(array_agg(key order by key), '{}') from jsonb_object_keys(document->'indicators') as key
$$;

-- The parts that take a clock, as the read runs them: inside it, as its owner.
create function pg_temp.inside(person uuid, membership uuid) returns void language plpgsql as $$
begin
  perform pg_temp.act(person, '019ae900-0000-7000-8000-00000000d0f0');
  perform set_config('app.actor_org_id', '019ae900-0000-7000-8000-000000000a01', true);
  perform set_config('app.actor_membership_id', membership::text, true);
  perform set_config('app.purpose', 'studio_attention_today', true);
end
$$;

-- Each look is its own request, as each read of the API is.
create function pg_temp.adherence(at timestamptz) returns jsonb language plpgsql as $$
begin
  perform set_config('app.request_id', gen_random_uuid()::text, true);
  return relationships.today_adherence(
    (select coalesce(jsonb_agg(jsonb_build_object(
              'closed_through', evaluated.closed_through, 'weeks', evaluated.weeks)), '[]'::jsonb)
       from relationships.today_training('019ae900-0000-7000-8000-000000000a01', at) as evaluated),
    at);
end
$$;

create function pg_temp.week(document jsonb, starts_on date) returns jsonb language sql as $$
  select entry - 'week_starts_on'
  from jsonb_array_elements(document->'weeks') as entry
  where entry->>'week_starts_on' = starts_on::text
$$;

-- ---------------------------------------------------------------------------
-- Who is told what
-- ---------------------------------------------------------------------------

set local role allfit_api;

select pg_temp.today('019ae900-0000-7000-8000-000000000011', 'America/Bogota') as owner \gset
select pg_temp.today('019ae900-0000-7000-8000-000000000012', 'America/Bogota',
  request => '019ae900-0000-7000-8000-00000000d001') as coach \gset

select is(
  pg_temp.keys(:'owner'),
  array['professional_load', 'relationship_changes'],
  'the owner is told how the gym grows and who holds whom, and nothing of training'
);

select is(
  pg_temp.keys(pg_temp.today('019ae900-0000-7000-8000-000000000016', 'America/Bogota')),
  array['professional_load', 'relationship_changes'],
  'an admin is told the same'
);

select is(
  pg_temp.keys(:'coach'),
  array['training_adherence'],
  'a coach is told how the clients he attends keep up, and nothing of the gym'
);

select is(
  pg_temp.keys(pg_temp.today('019ae900-0000-7000-8000-000000000014', 'America/Bogota')),
  array['relationship_changes'],
  'staff, who see the directory, are told how the gym grows'
);

select is(
  pg_temp.keys(pg_temp.today('019ae900-0000-7000-8000-000000000011')),
  array['professional_load'],
  'a month is a local question: with no timezone it is not answered in UTC, it is absent'
);

select is(
  pg_temp.today('019ae900-0000-7000-8000-000000000014')->'indicators',
  '{}'::jsonb,
  'with nothing her roles open, the indicators are there and empty'
);

select throws_ok(
  $$select pg_temp.today('019ae900-0000-7000-8000-000000000011', 'Mars/Olympus_Mons')$$,
  '22023', 'unknown timezone',
  'a timezone PostgreSQL does not know is refused'
);

-- ---------------------------------------------------------------------------
-- Clients per professional
-- ---------------------------------------------------------------------------

select is(
  (:'owner'::jsonb)->'indicators'->'professional_load',
  '{"count": 3, "unassigned": 2, "items": [
     {"membership_id": "019ae900-0000-7000-8000-000000000212", "display_name": "Camilo Coach", "clients": 4},
     {"membership_id": "019ae900-0000-7000-8000-000000000213", "display_name": "Diana Coach", "clients": 2},
     {"membership_id": "019ae900-0000-7000-8000-000000000217", "display_name": "Tomas Coach", "clients": 0}]}'::jsonb,
  'every coach in force with the clients he holds today, most first: one with none is listed, a cover and a past holder hold nobody, and who left or lost the role is not a coach'
);

select pg_temp.today('019ae900-0000-7000-8000-000000000021', 'America/Bogota',
  '019ae900-0000-7000-8000-000000000a03') as large \gset

select is(
  jsonb_build_array(
    (:'large'::jsonb)->'indicators'->'professional_load'->'count',
    jsonb_array_length((:'large'::jsonb)->'indicators'->'professional_load'->'items')),
  '[13, 12]'::jsonb,
  'thirteen coaches counted, twelve listed'
);

select ok(
  (:'large'::jsonb->>'empty')::boolean,
  'an indicator is a state, not work waiting: a gym with coaches and no clients is still empty'
);

-- ---------------------------------------------------------------------------
-- Adherence, as the read gives it
-- ---------------------------------------------------------------------------

select is(
  jsonb_build_array(
    (:'coach'::jsonb)->'indicators'->'training_adherence'->'clients',
    jsonb_array_length((:'coach'::jsonb)->'indicators'->'training_adherence'->'weeks')),
  '[3, 8]'::jsonb,
  'the three clients he attends who share their training, over eight weeks: not the one who withdrew hers, not Diana''s'
);

select is(
  pg_temp.week((:'coach'::jsonb)->'indicators'->'training_adherence', :'three_back'),
  '{"planned": 1, "logged": 1}'::jsonb,
  'what Ciro logged three weeks ago is in its week'
);

reset role;

select is(
  (select array_agg(subject_person_id::text order by subject_person_id)
     from privacy.access_events where request_id = '019ae900-0000-7000-8000-00000000d001'),
  array['019ae900-0000-7000-8000-000000000001', '019ae900-0000-7000-8000-000000000002',
        '019ae900-0000-7000-8000-000000000003'],
  'one access event per client evaluated, as before: the eight weeks add none, and who withdrew has none'
);

select is(
  (select count(*) from privacy.access_events where request_id = '019ae900-0000-7000-8000-00000000d000'),
  0::bigint,
  'counting relationships and who holds them reads no client''s data'
);

-- ---------------------------------------------------------------------------
-- Adherence, with the clock handed in
-- ---------------------------------------------------------------------------

-- Monday 2025-11-03 at 02:00 UTC is Sunday evening in Bogotá: the last week closed
-- there began on 20 October, and the one of the 27th is still open.
set local role allfit_owner;
select pg_temp.inside('019ae900-0000-7000-8000-000000000012', '019ae900-0000-7000-8000-000000000212');

select is(
  pg_temp.week(pg_temp.adherence('2025-11-03T02:00:00Z'), '2025-10-06'),
  '{"planned": 2, "logged": 2}'::jsonb,
  'what Bea trained on her own and shares counts as logged'
);

-- She hides one of the two from this gym.
reset role;
insert into privacy.session_visibility_denials (person_id, executed_session_id, relationship_id, status, denied_at)
values ('019ae900-0000-7000-8000-000000000002', '019ae900-0000-7000-8000-000000000e23',
        '019ae900-0000-7000-8000-000000000702', 'active', clock_timestamp());
set local role allfit_owner;
select pg_temp.inside('019ae900-0000-7000-8000-000000000012', '019ae900-0000-7000-8000-000000000212');

select is(
  pg_temp.adherence('2025-11-03T02:00:00Z'),
  '{"clients": 3, "weeks": [
     {"week_starts_on": "2025-09-01", "planned": 1, "logged": 0},
     {"week_starts_on": "2025-09-08", "planned": 0, "logged": 0},
     {"week_starts_on": "2025-09-15", "planned": 0, "logged": 0},
     {"week_starts_on": "2025-09-22", "planned": 0, "logged": 0},
     {"week_starts_on": "2025-09-29", "planned": 0, "logged": 0},
     {"week_starts_on": "2025-10-06", "planned": 2, "logged": 1},
     {"week_starts_on": "2025-10-13", "planned": 1, "logged": 1},
     {"week_starts_on": "2025-10-20", "planned": 3, "logged": 1}]}'::jsonb,
  'eight closed weeks, oldest first, summed over his clients, ending at the last one closed for all of them: a session she hid is not logged, nor one annulled; cancelled and paused were never due; a week with nothing due says 0 and 0'
);

select set_config('app.request_id', gen_random_uuid()::text, true);
select is(
  (select row(closed_through, week_starts_on, planned, not_logged,
              (select max(entry->>'week_starts_on') from jsonb_array_elements(weeks) as entry))::text
     from relationships.today_training('019ae900-0000-7000-8000-000000000a01', '2025-11-03T02:00:00Z')
    where person_id = '019ae900-0000-7000-8000-000000000001'),
  row('2025-10-20'::date, '2025-10-20'::date, 2, 1, '2025-10-20')::text,
  'the week closes in her timezone, not in UTC: the one still open is in no week of hers, and the notice counts her last one as it did'
);

select is(
  (select row(closed_through, weeks)::text
     from relationships.today_training('019ae900-0000-7000-8000-000000000a01', '2025-11-03T02:00:00Z')
    where person_id = '019ae900-0000-7000-8000-000000000003'),
  row('2025-10-27'::date, '[{"week_starts_on": "2025-10-27", "planned": 1, "logged": 1}]'::jsonb)::text,
  'for Ciro, in Tokyo, that same week has closed'
);

select set_config('app.request_id', gen_random_uuid()::text, true);
select is(
  (select array_agg(person_id::text order by person_id)
     from relationships.today_training('019ae900-0000-7000-8000-000000000a01', '2025-11-03T02:00:00Z')),
  array['019ae900-0000-7000-8000-000000000001', '019ae900-0000-7000-8000-000000000002',
        '019ae900-0000-7000-8000-000000000003'],
  'every client evaluated comes back, with or without something to look at'
);

-- Five hours later it is Monday in Bogotá too.
select is(
  (select jsonb_build_array(weeks->0->'week_starts_on', weeks->7)
     from (select pg_temp.adherence('2025-11-03T05:00:00Z')->'weeks' as weeks) as later),
  '["2025-09-08", {"week_starts_on": "2025-10-27", "planned": 2, "logged": 2}]'::jsonb,
  'once the week has closed for all of them it joins, with what each logged in it, and the oldest leaves'
);

select pg_temp.inside('019ae900-0000-7000-8000-000000000013', '019ae900-0000-7000-8000-000000000213');
select is(
  (select jsonb_build_array(adherence->'clients', adherence->'weeks'->7)
     from (select pg_temp.adherence('2025-11-03T02:00:00Z') as adherence) as hers),
  '[1, {"week_starts_on": "2025-10-20", "planned": 1, "logged": 0}]'::jsonb,
  'Diana sums the client she holds who shares her training, and no other'
);

select pg_temp.inside('019ae900-0000-7000-8000-000000000017', '019ae900-0000-7000-8000-000000000217');
select is(
  (select jsonb_build_array(
            adherence->'clients',
            adherence->'weeks'->0->'week_starts_on', adherence->'weeks'->7->'week_starts_on',
            (select sum((entry->>'planned')::integer) from jsonb_array_elements(adherence->'weeks') as entry))
     from (select pg_temp.adherence('2025-11-03T02:00:00Z') as adherence) as his),
  '[0, "2025-09-08", "2025-10-27", 0]'::jsonb,
  'with nobody to sum, eight empty weeks: no program says where they close, so they close in UTC'
);

-- ---------------------------------------------------------------------------
-- Relationships begun and ended, with the clock handed in
-- ---------------------------------------------------------------------------

-- 2025-11-01 at 02:00 UTC is still 31 October in Bogotá.
select pg_temp.inside('019ae900-0000-7000-8000-000000000011', '019ae900-0000-7000-8000-000000000211');

select is(
  relationships.today_relationship_changes(
    '019ae900-0000-7000-8000-000000000a01', 'America/Bogota', '2025-11-01T02:00:00Z'),
  '{"months": [
     {"month": "2025-05", "started": 0, "ended": 1},
     {"month": "2025-06", "started": 0, "ended": 0},
     {"month": "2025-07", "started": 0, "ended": 0},
     {"month": "2025-08", "started": 1, "ended": 0},
     {"month": "2025-09", "started": 1, "ended": 1},
     {"month": "2025-10", "started": 2, "ended": 0}]}'::jsonb,
  'six months of Bogotá, this one last: each relationship in the month it began or ended there, and none of another gym'
);

select is(
  relationships.today_relationship_changes(
    '019ae900-0000-7000-8000-000000000a01', 'UTC', '2025-11-01T02:00:00Z'),
  '{"months": [
     {"month": "2025-06", "started": 0, "ended": 1},
     {"month": "2025-07", "started": 0, "ended": 0},
     {"month": "2025-08", "started": 1, "ended": 0},
     {"month": "2025-09", "started": 0, "ended": 1},
     {"month": "2025-10", "started": 2, "ended": 0},
     {"month": "2025-11", "started": 1, "ended": 0}]}'::jsonb,
  'the same relationships seen from UTC fall in other months: the cut is the viewer''s'
);

-- Camilo does not see the directory: the row policy shows him only whom he attends.
select pg_temp.inside('019ae900-0000-7000-8000-000000000012', '019ae900-0000-7000-8000-000000000212');
select is(
  (select sum((entry->>'started')::integer + (entry->>'ended')::integer)
     from jsonb_array_elements(relationships.today_relationship_changes(
       '019ae900-0000-7000-8000-000000000a01', 'America/Bogota', '2025-11-01T02:00:00Z')->'months') as entry),
  0::bigint,
  'the count never exceeds what the member could list: a coach would count none of these'
);

reset role;

select ok(
  has_function_privilege('allfit_api', 'relationships.read_studio_today(uuid, uuid)', 'execute'),
  'the API reads the summary'
);

select ok(
  not has_function_privilege('allfit_api', 'relationships.today_training(uuid, timestamptz)', 'execute')
  and not has_function_privilege('allfit_api', 'relationships.today_adherence(jsonb, timestamptz)', 'execute')
  and not has_function_privilege('allfit_api',
    'relationships.today_relationship_changes(uuid, text, timestamptz)', 'execute'),
  'but never runs one of its parts by itself'
);

select * from finish();

rollback;
