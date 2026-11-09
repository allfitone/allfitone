-- T-REL-TODAY-01 — OP-REL-020, what needs attention today, by role (HU-STUDIO-081).
--
-- One read says what waits on the person who opens Studio, and only what her roles let
-- her resolve:
--
--   · unanswered client invitations (only her own when she does not see the directory),
--     relationships with no holder, termination requests, team invitations, the team
--     and the relationships of the last seven days;
--   · a notice she cannot act on is absent, not empty;
--   · each notice counts everything and lists at most five;
--   · when nothing waits it says so;
--   · none of this reads a client's data, so it writes no access event.
begin;

select plan(24);

insert into identity.people (id, given_name, family_name, status)
values
  ('019ae500-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019ae500-0000-7000-8000-000000000002', 'Bea', 'Client', 'active'),
  ('019ae500-0000-7000-8000-000000000003', 'Ciro', 'Client', 'active'),
  ('019ae500-0000-7000-8000-000000000004', 'Dora', 'Client', 'active'),
  ('019ae500-0000-7000-8000-000000000005', 'Eli', 'Client', 'active'),
  ('019ae500-0000-7000-8000-000000000006', 'Fer', 'Client', 'active'),
  ('019ae500-0000-7000-8000-000000000007', 'Gil', 'Client', 'active'),
  ('019ae500-0000-7000-8000-000000000008', 'Hugo', 'Elsewhere', 'active'),
  ('019ae500-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019ae500-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019ae500-0000-7000-8000-000000000013', 'Diana', 'Coach', 'active'),
  ('019ae500-0000-7000-8000-000000000014', 'Sara', 'Staff', 'active'),
  ('019ae500-0000-7000-8000-000000000015', 'Nora', 'Former', 'active'),
  ('019ae500-0000-7000-8000-000000000016', 'Gina', 'Admin', 'active'),
  ('019ae500-0000-7000-8000-000000000017', 'Pablo', 'Alone', 'active'),
  ('019ae500-0000-7000-8000-000000000018', 'Quinn', 'Nobody', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019ae500-0000-7000-8000-000000000101', 'gym', 'Gym Hoy',
   '{"party_kind":"legal_entity","party_name":"Hoy SAS","purpose":"studio_operations"}'),
  ('019ae500-0000-7000-8000-000000000102', 'gym', 'Gym Otro',
   '{"party_kind":"legal_entity","party_name":"Otro SAS","purpose":"studio_operations"}'),
  ('019ae500-0000-7000-8000-000000000103', 'gym', 'Gym Nuevo',
   '{"party_kind":"legal_entity","party_name":"Nuevo SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019ae500-0000-7000-8000-000000000211', '019ae500-0000-7000-8000-000000000101', '019ae500-0000-7000-8000-000000000011', 'active'),
  ('019ae500-0000-7000-8000-000000000212', '019ae500-0000-7000-8000-000000000101', '019ae500-0000-7000-8000-000000000012', 'active'),
  ('019ae500-0000-7000-8000-000000000213', '019ae500-0000-7000-8000-000000000101', '019ae500-0000-7000-8000-000000000013', 'active'),
  ('019ae500-0000-7000-8000-000000000214', '019ae500-0000-7000-8000-000000000101', '019ae500-0000-7000-8000-000000000014', 'active'),
  ('019ae500-0000-7000-8000-000000000215', '019ae500-0000-7000-8000-000000000101', '019ae500-0000-7000-8000-000000000015', 'active'),
  ('019ae500-0000-7000-8000-000000000216', '019ae500-0000-7000-8000-000000000101', '019ae500-0000-7000-8000-000000000016', 'active'),
  ('019ae500-0000-7000-8000-000000000221', '019ae500-0000-7000-8000-000000000102', '019ae500-0000-7000-8000-000000000011', 'active'),
  ('019ae500-0000-7000-8000-000000000231', '019ae500-0000-7000-8000-000000000103', '019ae500-0000-7000-8000-000000000017', 'active');

insert into organizations.membership_roles (membership_id, role_code, valid_from, valid_to)
values
  ('019ae500-0000-7000-8000-000000000211', 'owner', now() - interval '1 year', null),
  ('019ae500-0000-7000-8000-000000000212', 'coach', now() - interval '1 year', null),
  ('019ae500-0000-7000-8000-000000000213', 'coach', now() - interval '1 year', null),
  ('019ae500-0000-7000-8000-000000000214', 'staff', now() - interval '1 year', null),
  -- Nora is still a member, with no role in force.
  ('019ae500-0000-7000-8000-000000000215', 'coach', now() - interval '1 year', now() - interval '1 day'),
  ('019ae500-0000-7000-8000-000000000216', 'admin', now() - interval '1 year', null),
  ('019ae500-0000-7000-8000-000000000221', 'owner', now() - interval '1 year', null),
  ('019ae500-0000-7000-8000-000000000231', 'owner', now() - interval '1 year', null);

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at, ended_at)
select id, person, organization, status::relationships.relationship_status, now() - started, ended
from (values
  ('019ae500-0000-7000-8000-000000000701'::uuid, '019ae500-0000-7000-8000-000000000001'::uuid, '019ae500-0000-7000-8000-000000000101'::uuid, 'active', interval '60 days', null::timestamptz),
  ('019ae500-0000-7000-8000-000000000702', '019ae500-0000-7000-8000-000000000002', '019ae500-0000-7000-8000-000000000101', 'active', interval '40 days', null),
  ('019ae500-0000-7000-8000-000000000703', '019ae500-0000-7000-8000-000000000003', '019ae500-0000-7000-8000-000000000101', 'active', interval '2 days', null),
  ('019ae500-0000-7000-8000-000000000704', '019ae500-0000-7000-8000-000000000004', '019ae500-0000-7000-8000-000000000101', 'active', interval '30 days', null),
  ('019ae500-0000-7000-8000-000000000705', '019ae500-0000-7000-8000-000000000005', '019ae500-0000-7000-8000-000000000101', 'terminated', interval '3 days', now() - interval '1 day'),
  ('019ae500-0000-7000-8000-000000000706', '019ae500-0000-7000-8000-000000000006', '019ae500-0000-7000-8000-000000000101', 'active', interval '6 days', null),
  ('019ae500-0000-7000-8000-000000000707', '019ae500-0000-7000-8000-000000000007', '019ae500-0000-7000-8000-000000000101', 'active', interval '8 days', null),
  ('019ae500-0000-7000-8000-000000000711', '019ae500-0000-7000-8000-000000000008', '019ae500-0000-7000-8000-000000000102', 'active', interval '1 day', null)
) as relationship (id, person, organization, status, started, ended);

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, valid_from, valid_to, ends_on, accepted_by_person_at
)
select id, relationship, person, '019ae500-0000-7000-8000-000000000101', membership, covers,
       kind::relationships.assignment_kind, status::relationships.assignment_status,
       valid_from, valid_to, ends_on, accepted
from (values
  ('019ae500-0000-7000-8000-000000000801'::uuid, '019ae500-0000-7000-8000-000000000701'::uuid, '019ae500-0000-7000-8000-000000000001'::uuid,
   '019ae500-0000-7000-8000-000000000212'::uuid, null::uuid, 'holder', 'active', now() - interval '60 days', null::timestamptz, null::date, null::timestamptz),
  -- Bea: her holder left five days ago; Camilo covers her, which is no holder.
  ('019ae500-0000-7000-8000-000000000802', '019ae500-0000-7000-8000-000000000702', '019ae500-0000-7000-8000-000000000002',
   '019ae500-0000-7000-8000-000000000213', null, 'holder', 'ended', now() - interval '40 days', now() - interval '5 days', null, null),
  ('019ae500-0000-7000-8000-000000000803', '019ae500-0000-7000-8000-000000000702', '019ae500-0000-7000-8000-000000000002',
   '019ae500-0000-7000-8000-000000000212', '019ae500-0000-7000-8000-000000000213', 'substitute', 'active',
   now() - interval '4 days', null, current_date + 5, now() - interval '4 days'),
  ('019ae500-0000-7000-8000-000000000804', '019ae500-0000-7000-8000-000000000704', '019ae500-0000-7000-8000-000000000004',
   '019ae500-0000-7000-8000-000000000213', null, 'holder', 'active', now() - interval '30 days', null, null, null),
  ('019ae500-0000-7000-8000-000000000806', '019ae500-0000-7000-8000-000000000706', '019ae500-0000-7000-8000-000000000006',
   '019ae500-0000-7000-8000-000000000213', null, 'holder', 'active', now() - interval '6 days', null, null, null),
  ('019ae500-0000-7000-8000-000000000807', '019ae500-0000-7000-8000-000000000707', '019ae500-0000-7000-8000-000000000007',
   '019ae500-0000-7000-8000-000000000212', null, 'holder', 'active', now() - interval '8 days', null, null, null)
) as row (id, relationship, person, membership, covers, kind, status, valid_from, valid_to, ends_on, accepted);

insert into relationships.relationship_termination_requests (
  id, relationship_id, organization_id, requested_by_membership_id, status,
  resolved_by_membership_id, created_at, resolved_at
) values
  ('019ae500-0000-7000-8000-000000000901', '019ae500-0000-7000-8000-000000000704', '019ae500-0000-7000-8000-000000000101',
   '019ae500-0000-7000-8000-000000000213', 'pending', null, now() - interval '1 day', null),
  ('019ae500-0000-7000-8000-000000000902', '019ae500-0000-7000-8000-000000000701', '019ae500-0000-7000-8000-000000000101',
   '019ae500-0000-7000-8000-000000000212', 'resolved', '019ae500-0000-7000-8000-000000000211',
   now() - interval '9 days', now() - interval '8 days');

-- Client invitations: six of Sara's waiting; Camilo's waiting, lapsed by date, expired,
-- expired long ago, revoked and answered; one in another gym.
insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact, token_hash, token_key_version,
  proposal_hash, responsible_party, status, created_at, expires_at
)
select id, organization, membership, 'email', contact, extensions.digest(id::text, 'sha256'), 1,
       extensions.digest('proposal-' || id::text, 'sha256'),
       '{"party_kind":"legal_entity","party_name":"Hoy SAS","purpose":"studio_operations"}',
       status::identity.invitation_status, now() - created, now() + expires
from (
  select ('019ae500-0000-7000-8000-00000000050' || n)::uuid, '019ae500-0000-7000-8000-000000000101'::uuid,
         '019ae500-0000-7000-8000-000000000214'::uuid, 'sara' || n || '@example.test', 'pending',
         make_interval(mins => n), interval '7 days'
  from generate_series(1, 6) as n
  union all values
  ('019ae500-0000-7000-8000-000000000511'::uuid, '019ae500-0000-7000-8000-000000000101'::uuid,
   '019ae500-0000-7000-8000-000000000212'::uuid, 'camilo1@example.test', 'pending', interval '1 hour', interval '6 days'),
  ('019ae500-0000-7000-8000-000000000512', '019ae500-0000-7000-8000-000000000101',
   '019ae500-0000-7000-8000-000000000212', 'camilo2@example.test', 'pending', interval '10 days', interval '-1 day'),
  ('019ae500-0000-7000-8000-000000000513', '019ae500-0000-7000-8000-000000000101',
   '019ae500-0000-7000-8000-000000000212', 'camilo3@example.test', 'expired', interval '9 days', interval '-2 days'),
  ('019ae500-0000-7000-8000-000000000514', '019ae500-0000-7000-8000-000000000101',
   '019ae500-0000-7000-8000-000000000212', 'camilo4@example.test', 'expired', interval '30 days', interval '-20 days'),
  ('019ae500-0000-7000-8000-000000000515', '019ae500-0000-7000-8000-000000000101',
   '019ae500-0000-7000-8000-000000000212', 'camilo5@example.test', 'revoked', interval '2 days', interval '5 days'),
  ('019ae500-0000-7000-8000-000000000516', '019ae500-0000-7000-8000-000000000101',
   '019ae500-0000-7000-8000-000000000212', 'camilo6@example.test', 'completed', interval '3 days', interval '4 days'),
  ('019ae500-0000-7000-8000-000000000517', '019ae500-0000-7000-8000-000000000102',
   '019ae500-0000-7000-8000-000000000221', 'otro@example.test', 'pending', interval '1 hour', interval '6 days'),
  -- Team invitations: waiting, expired yesterday, revoked.
  ('019ae500-0000-7000-8000-000000000521', '019ae500-0000-7000-8000-000000000101',
   '019ae500-0000-7000-8000-000000000211', 'coach@example.test', 'pending', interval '1 day', interval '6 days'),
  ('019ae500-0000-7000-8000-000000000522', '019ae500-0000-7000-8000-000000000101',
   '019ae500-0000-7000-8000-000000000211', 'staff@example.test', 'expired', interval '8 days', interval '-1 day'),
  ('019ae500-0000-7000-8000-000000000523', '019ae500-0000-7000-8000-000000000101',
   '019ae500-0000-7000-8000-000000000211', 'gone@example.test', 'revoked', interval '2 days', interval '5 days')
) as invitation (id, organization, membership, contact, status, created, expires);

insert into identity.invitation_intents (invitation_id, kind, status, proposed_role_code, decided_at)
select invitation.id,
       case when right(invitation.id::text, 3) like '52_' then 'membership' else 'service_relationship' end::identity.invitation_intent_kind,
       case invitation.status::text
         when 'pending' then 'pending' when 'expired' then 'expired'
         when 'revoked' then 'revoked' else 'rejected' end::identity.invitation_intent_status,
       case right(invitation.id::text, 3) when '521' then 'coach' when '522' then 'staff' when '523' then 'coach' end,
       case when invitation.status <> 'pending' then invitation.created_at + interval '1 minute' end
from identity.invitations as invitation
where invitation.id::text like '019ae500-%';

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.request_id', '019ae500-0000-7000-8000-00000000aaaa', true);
end
$$;

create function pg_temp.today(person uuid, organization uuid default '019ae500-0000-7000-8000-000000000101')
returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(person);
  return relationships.read_studio_today(person, organization);
end
$$;

create function pg_temp.keys(document jsonb) returns text[] language sql as $$
  select array_agg(key order by key) from jsonb_object_keys(document->'notices') as key
$$;

set local role allfit_api;

select pg_temp.today('019ae500-0000-7000-8000-000000000011') as owner \gset
select pg_temp.today('019ae500-0000-7000-8000-000000000012') as coach \gset
select pg_temp.today('019ae500-0000-7000-8000-000000000014') as staff \gset
select pg_temp.today('019ae500-0000-7000-8000-000000000016') as admin \gset

select is(
  pg_temp.keys(:'owner'),
  array['client_invitations', 'new_relationships', 'team', 'team_invitations',
        'termination_requests', 'unassigned_relationships'],
  'the owner sees what an owner resolves, and nothing of training'
);

select is(pg_temp.keys(:'admin'), pg_temp.keys(:'owner'), 'an admin sees the same notices');

select is(
  pg_temp.keys(:'coach'),
  array['client_invitations', 'training'],
  'a coach sees his invitations and the training of whom he attends'
);

select is(
  pg_temp.keys(:'staff'),
  array['client_invitations', 'new_relationships', 'team_invitations'],
  'staff see invitations and new relationships, never training'
);

select is(
  ((:'owner'::jsonb)->'notices'->'client_invitations') - 'items',
  '{"count": 9, "awaiting": 7, "lapsed": 2}'::jsonb,
  'every client invitation still waiting, and those that lapsed this week, of the whole gym'
);

select is(
  jsonb_array_length((:'owner'::jsonb)->'notices'->'client_invitations'->'items'),
  5,
  'nine counted, five listed'
);

select is(
  ((:'owner'::jsonb)->'notices'->'client_invitations'->'items'->0) - 'created_at' - 'expires_at',
  '{"invitation_id": "019ae500-0000-7000-8000-000000000501", "contact": "s***@example.test", "state": "awaiting"}'::jsonb,
  'newest first, with the contact masked as the directory masks it'
);

select is(
  ((:'coach'::jsonb)->'notices'->'client_invitations') - 'items',
  '{"count": 3, "awaiting": 1, "lapsed": 2}'::jsonb,
  'a coach who does not see the directory counts only the invitations he sent'
);

select is(
  (select array_agg(item->>'invitation_id' order by item->>'invitation_id')
     from jsonb_array_elements((:'coach'::jsonb)->'notices'->'client_invitations'->'items') as item),
  array['019ae500-0000-7000-8000-000000000511', '019ae500-0000-7000-8000-000000000512',
        '019ae500-0000-7000-8000-000000000513'],
  'and lists only those'
);

select is(
  ((:'staff'::jsonb)->'notices'->'client_invitations'->>'count')::integer,
  9,
  'staff, who see the directory, count all of them'
);

select is(
  (:'owner'::jsonb)->'notices'->'unassigned_relationships'->'count',
  '2'::jsonb,
  'a relationship whose holder left, and a new one nobody holds yet; a cover holds nobody'
);

select is(
  (select array_agg(item->>'display_name')
     from jsonb_array_elements((:'owner'::jsonb)->'notices'->'unassigned_relationships'->'items') as item),
  array['Bea Client', 'Ciro Client'],
  'the one waiting longest first'
);

select is(
  (:'owner'::jsonb)->'notices'->'termination_requests' #- '{items,0,requested_at}',
  '{"count": 1, "items": [{"request_id": "019ae500-0000-7000-8000-000000000901", "relationship_id": "019ae500-0000-7000-8000-000000000704", "person_id": "019ae500-0000-7000-8000-000000000004", "display_name": "Dora Client"}]}'::jsonb,
  'a pending termination request, not one already settled'
);

select is(
  ((:'owner'::jsonb)->'notices'->'team_invitations') - 'items',
  '{"count": 2, "awaiting": 1, "lapsed": 1}'::jsonb,
  'team invitations waiting or lapsed this week; a revoked one is gone'
);

select is(
  (select array_agg(item->>'proposed_role_code' || ':' || (item->>'state'))
     from jsonb_array_elements((:'owner'::jsonb)->'notices'->'team_invitations'->'items') as item),
  array['coach:awaiting', 'staff:lapsed'],
  'each says the role it proposes'
);

select is(
  (:'owner'::jsonb)->'notices'->'team',
  '{"count": 5, "by_role": [{"role_code": "admin", "count": 1}, {"role_code": "coach", "count": 2}, {"role_code": "owner", "count": 1}, {"role_code": "staff", "count": 1}]}'::jsonb,
  'the team: members with a role in force, by role'
);

select is(
  (select array_agg(item->>'display_name')
     from jsonb_array_elements((:'owner'::jsonb)->'notices'->'new_relationships'->'items') as item),
  array['Ciro Client', 'Fer Client'],
  'live relationships of the last seven days, newest first; one ended already is not new'
);

select is(
  (:'coach'::jsonb)->'notices'->'training',
  '{"count": 0, "items": []}'::jsonb,
  'with nothing shared, a coach has no training to look at'
);

select ok(
  not (:'owner'::jsonb->>'empty')::boolean and not (:'coach'::jsonb->>'empty')::boolean,
  'something waits, so it is not empty'
);

select is(
  pg_temp.today('019ae500-0000-7000-8000-000000000017', '019ae500-0000-7000-8000-000000000103') - 'generated_at',
  '{"organization_id": "019ae500-0000-7000-8000-000000000103", "empty": true, "notices": {"client_invitations": {"count": 0, "awaiting": 0, "lapsed": 0, "items": []}, "unassigned_relationships": {"count": 0, "items": []}, "termination_requests": {"count": 0, "items": []}, "team_invitations": {"count": 0, "awaiting": 0, "lapsed": 0, "items": []}, "team": {"count": 1, "by_role": [{"role_code": "owner", "count": 1}]}, "new_relationships": {"count": 0, "items": []}}}'::jsonb,
  'a new gym with nothing waiting says so: the team is a state, not something to resolve'
);

select throws_ok(
  $$select pg_temp.today('019ae500-0000-7000-8000-000000000015')$$,
  '42501', 'a studio capability is required',
  'a member with no role in force has nothing to attend to'
);

select throws_ok(
  $$select pg_temp.today('019ae500-0000-7000-8000-000000000018')$$,
  '42501', 'a live membership is required',
  'nor does somebody who is not a member'
);

select throws_ok(
  $$select relationships.read_studio_today(
    '019ae500-0000-7000-8000-000000000011', '019ae500-0000-7000-8000-000000000101')$$,
  '42501', 'person actor mismatch',
  'nobody reads it in somebody else''s name'
);

reset role;

select is(
  (select count(*) from privacy.access_events
    where request_id = '019ae500-0000-7000-8000-00000000aaaa'),
  0::bigint,
  'counting invitations, members and relationships reads no client''s data'
);

select * from finish();

rollback;
