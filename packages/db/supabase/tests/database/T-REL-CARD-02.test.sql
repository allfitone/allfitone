-- T-REL-CARD-02 — OP-REL-019, why a coach stopped seeing a client (HU-STUDIO-084).
--
-- A coach who opens the card of somebody he no longer attends is told why, for thirty
-- days after he lost her, and nobody else is told anything:
--
--   · she left the gym (`relationship_ended`), his attendance ended while the link went
--     on (`assignment_ended`), or his cover ran out (`substitution_ended`);
--   · the answer is fixed at the moment he lost her: what happens to her afterwards,
--     including coming back to the gym with another coach, never changes it;
--   · it says no name, no relationship and no permission;
--   · a cover she refused, or never answered, was never attendance.
begin;

select plan(19);

insert into identity.people (id, given_name, family_name, status)
values
  ('019ae300-0000-7000-8000-000000000001', 'Pia', 'Left', 'active'),
  ('019ae300-0000-7000-8000-000000000002', 'Quim', 'Reassigned', 'active'),
  ('019ae300-0000-7000-8000-000000000003', 'Rosa', 'Reassigned', 'active'),
  ('019ae300-0000-7000-8000-000000000004', 'Sol', 'Covered', 'active'),
  ('019ae300-0000-7000-8000-000000000005', 'Tea', 'Covered', 'active'),
  ('019ae300-0000-7000-8000-000000000006', 'Uma', 'Covered', 'active'),
  ('019ae300-0000-7000-8000-000000000007', 'Vera', 'Long', 'active'),
  ('019ae300-0000-7000-8000-000000000008', 'Wes', 'Recent', 'active'),
  ('019ae300-0000-7000-8000-000000000009', 'Xia', 'Declined', 'active'),
  ('019ae300-0000-7000-8000-000000000010', 'Yan', 'Returned', 'active'),
  ('019ae300-0000-7000-8000-000000000016', 'Zoe', 'Twice', 'active'),
  ('019ae300-0000-7000-8000-000000000017', 'Ivo', 'Covered', 'active'),
  ('019ae300-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019ae300-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019ae300-0000-7000-8000-000000000013', 'Diana', 'Coach', 'active'),
  ('019ae300-0000-7000-8000-000000000014', 'Hugo', 'Desk', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019ae300-0000-7000-8000-000000000101', 'gym', 'Former Gym',
  '{"party_kind":"legal_entity","party_name":"Former SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019ae300-0000-7000-8000-000000000211', '019ae300-0000-7000-8000-000000000101', '019ae300-0000-7000-8000-000000000011', 'active'),
  ('019ae300-0000-7000-8000-000000000212', '019ae300-0000-7000-8000-000000000101', '019ae300-0000-7000-8000-000000000012', 'active'),
  ('019ae300-0000-7000-8000-000000000213', '019ae300-0000-7000-8000-000000000101', '019ae300-0000-7000-8000-000000000013', 'active'),
  ('019ae300-0000-7000-8000-000000000214', '019ae300-0000-7000-8000-000000000101', '019ae300-0000-7000-8000-000000000014', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019ae300-0000-7000-8000-000000000211', 'owner'),
  ('019ae300-0000-7000-8000-000000000212', 'coach'),
  ('019ae300-0000-7000-8000-000000000213', 'coach'),
  ('019ae300-0000-7000-8000-000000000214', 'coach'),
  ('019ae300-0000-7000-8000-000000000214', 'staff');

-- `now()` is the transaction's instant, so an end and the attendance it closed share it.
insert into relationships.service_relationships (id, person_id, organization_id, status, started_at, ended_at)
select id, person, '019ae300-0000-7000-8000-000000000101', status::relationships.relationship_status,
       now() - interval '90 days', ended
from (values
  ('019ae300-0000-7000-8000-000000000701'::uuid, '019ae300-0000-7000-8000-000000000001'::uuid, 'terminated', now() - interval '3 days'),
  ('019ae300-0000-7000-8000-000000000702', '019ae300-0000-7000-8000-000000000002', 'active', null),
  ('019ae300-0000-7000-8000-000000000703', '019ae300-0000-7000-8000-000000000003', 'terminated', now() - interval '2 days'),
  ('019ae300-0000-7000-8000-000000000704', '019ae300-0000-7000-8000-000000000004', 'active', null),
  ('019ae300-0000-7000-8000-000000000705', '019ae300-0000-7000-8000-000000000005', 'active', null),
  ('019ae300-0000-7000-8000-000000000706', '019ae300-0000-7000-8000-000000000006', 'terminated', now() - interval '1 day'),
  ('019ae300-0000-7000-8000-000000000707', '019ae300-0000-7000-8000-000000000007', 'terminated', now() - interval '31 days'),
  ('019ae300-0000-7000-8000-000000000708', '019ae300-0000-7000-8000-000000000008', 'terminated', now() - interval '29 days'),
  ('019ae300-0000-7000-8000-000000000709', '019ae300-0000-7000-8000-000000000009', 'active', null),
  ('019ae300-0000-7000-8000-000000000710', '019ae300-0000-7000-8000-000000000010', 'terminated', now() - interval '10 days'),
  ('019ae300-0000-7000-8000-000000000716', '019ae300-0000-7000-8000-000000000016', 'active', null),
  ('019ae300-0000-7000-8000-000000000717', '019ae300-0000-7000-8000-000000000017', 'active', null)
) as relationship (id, person, status, ended);

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, valid_from, valid_to, ends_on, accepted_by_person_at
)
select id, relationship, person, '019ae300-0000-7000-8000-000000000101', membership, covers,
       kind::relationships.assignment_kind, status::relationships.assignment_status,
       valid_from, valid_to, ends_on, accepted
from (values
  -- Pia: Camilo held her until she left.
  ('019ae300-0000-7000-8000-000000000801'::uuid, '019ae300-0000-7000-8000-000000000701'::uuid, '019ae300-0000-7000-8000-000000000001'::uuid,
   '019ae300-0000-7000-8000-000000000212'::uuid, null::uuid, 'holder', 'ended', now() - interval '60 days', now() - interval '3 days', null::date, null::timestamptz),
  -- Quim: Camilo was replaced by Diana five days ago; the link goes on.
  ('019ae300-0000-7000-8000-000000000802', '019ae300-0000-7000-8000-000000000702', '019ae300-0000-7000-8000-000000000002',
   '019ae300-0000-7000-8000-000000000212', null, 'holder', 'ended', now() - interval '60 days', now() - interval '5 days', null, null),
  ('019ae300-0000-7000-8000-000000000812', '019ae300-0000-7000-8000-000000000702', '019ae300-0000-7000-8000-000000000002',
   '019ae300-0000-7000-8000-000000000213', null, 'holder', 'active', now() - interval '5 days', null, null, null),
  -- Rosa: Camilo was replaced six days ago, and she left two days ago.
  ('019ae300-0000-7000-8000-000000000803', '019ae300-0000-7000-8000-000000000703', '019ae300-0000-7000-8000-000000000003',
   '019ae300-0000-7000-8000-000000000212', null, 'holder', 'ended', now() - interval '60 days', now() - interval '6 days', null, null),
  ('019ae300-0000-7000-8000-000000000813', '019ae300-0000-7000-8000-000000000703', '019ae300-0000-7000-8000-000000000003',
   '019ae300-0000-7000-8000-000000000213', null, 'holder', 'ended', now() - interval '6 days', now() - interval '2 days', null, null),
  -- Sol: Camilo's cover was ended four days ago, well before its date.
  ('019ae300-0000-7000-8000-000000000814', '019ae300-0000-7000-8000-000000000704', '019ae300-0000-7000-8000-000000000004',
   '019ae300-0000-7000-8000-000000000213', null, 'holder', 'active', now() - interval '60 days', null, null, null),
  ('019ae300-0000-7000-8000-000000000804', '019ae300-0000-7000-8000-000000000704', '019ae300-0000-7000-8000-000000000004',
   '019ae300-0000-7000-8000-000000000212', '019ae300-0000-7000-8000-000000000213', 'substitute', 'ended',
   now() - interval '10 days', now() - interval '4 days', current_date + 10, now() - interval '10 days'),
  -- Tea: Camilo's cover ran out by its date three days ago; nothing was written.
  ('019ae300-0000-7000-8000-000000000815', '019ae300-0000-7000-8000-000000000705', '019ae300-0000-7000-8000-000000000005',
   '019ae300-0000-7000-8000-000000000213', null, 'holder', 'active', now() - interval '60 days', null, null, null),
  ('019ae300-0000-7000-8000-000000000805', '019ae300-0000-7000-8000-000000000705', '019ae300-0000-7000-8000-000000000005',
   '019ae300-0000-7000-8000-000000000212', '019ae300-0000-7000-8000-000000000213', 'substitute', 'active',
   now() - interval '20 days', null, current_date - 3, now() - interval '20 days'),
  -- Uma: Camilo was covering her when she left yesterday.
  ('019ae300-0000-7000-8000-000000000816', '019ae300-0000-7000-8000-000000000706', '019ae300-0000-7000-8000-000000000006',
   '019ae300-0000-7000-8000-000000000213', null, 'holder', 'ended', now() - interval '60 days', now() - interval '1 day', null, null),
  ('019ae300-0000-7000-8000-000000000806', '019ae300-0000-7000-8000-000000000706', '019ae300-0000-7000-8000-000000000006',
   '019ae300-0000-7000-8000-000000000212', '019ae300-0000-7000-8000-000000000213', 'substitute', 'ended',
   now() - interval '5 days', now() - interval '1 day', current_date + 10, now() - interval '5 days'),
  -- Vera left 31 days ago and Wes 29 days ago, both held by Camilo.
  ('019ae300-0000-7000-8000-000000000807', '019ae300-0000-7000-8000-000000000707', '019ae300-0000-7000-8000-000000000007',
   '019ae300-0000-7000-8000-000000000212', null, 'holder', 'ended', now() - interval '60 days', now() - interval '31 days', null, null),
  ('019ae300-0000-7000-8000-000000000808', '019ae300-0000-7000-8000-000000000708', '019ae300-0000-7000-8000-000000000008',
   '019ae300-0000-7000-8000-000000000212', null, 'holder', 'ended', now() - interval '60 days', now() - interval '29 days', null, null),
  -- Xia refused one cover by Camilo and has not answered another.
  ('019ae300-0000-7000-8000-000000000819', '019ae300-0000-7000-8000-000000000709', '019ae300-0000-7000-8000-000000000009',
   '019ae300-0000-7000-8000-000000000213', null, 'holder', 'active', now() - interval '60 days', null, null, null),
  ('019ae300-0000-7000-8000-000000000809', '019ae300-0000-7000-8000-000000000709', '019ae300-0000-7000-8000-000000000009',
   '019ae300-0000-7000-8000-000000000212', '019ae300-0000-7000-8000-000000000213', 'substitute', 'rejected',
   now() - interval '9 days', now() - interval '8 days', current_date - 2, null),
  ('019ae300-0000-7000-8000-000000000810', '019ae300-0000-7000-8000-000000000709', '019ae300-0000-7000-8000-000000000009',
   '019ae300-0000-7000-8000-000000000212', '019ae300-0000-7000-8000-000000000213', 'substitute', 'proposed',
   now() - interval '1 day', null, current_date + 3, null),
  -- Yan: Camilo held her until she left ten days ago.
  ('019ae300-0000-7000-8000-000000000811', '019ae300-0000-7000-8000-000000000710', '019ae300-0000-7000-8000-000000000010',
   '019ae300-0000-7000-8000-000000000212', null, 'holder', 'ended', now() - interval '60 days', now() - interval '10 days', null, null),
  -- Zoe: Camilo held her until Diana took over, then covered for Diana until two days ago.
  ('019ae300-0000-7000-8000-000000000821', '019ae300-0000-7000-8000-000000000716', '019ae300-0000-7000-8000-000000000016',
   '019ae300-0000-7000-8000-000000000212', null, 'holder', 'ended', now() - interval '60 days', now() - interval '20 days', null, null),
  ('019ae300-0000-7000-8000-000000000822', '019ae300-0000-7000-8000-000000000716', '019ae300-0000-7000-8000-000000000016',
   '019ae300-0000-7000-8000-000000000213', null, 'holder', 'active', now() - interval '20 days', null, null, null),
  ('019ae300-0000-7000-8000-000000000823', '019ae300-0000-7000-8000-000000000716', '019ae300-0000-7000-8000-000000000016',
   '019ae300-0000-7000-8000-000000000212', '019ae300-0000-7000-8000-000000000213', 'substitute', 'ended',
   now() - interval '10 days', now() - interval '2 days', current_date + 5, now() - interval '10 days'),
  -- Ivo: Hugo, who also works the desk and so sees every client, covered Diana until his
  -- cover's last day, three days ago; nothing was written when it ran out.
  ('019ae300-0000-7000-8000-000000000817', '019ae300-0000-7000-8000-000000000717', '019ae300-0000-7000-8000-000000000017',
   '019ae300-0000-7000-8000-000000000213', null, 'holder', 'active', now() - interval '60 days', null, null, null),
  ('019ae300-0000-7000-8000-000000000827', '019ae300-0000-7000-8000-000000000717', '019ae300-0000-7000-8000-000000000017',
   '019ae300-0000-7000-8000-000000000214', '019ae300-0000-7000-8000-000000000213', 'substitute', 'active',
   now() - interval '20 days', null, current_date - 3, now() - interval '20 days')
) as row (id, relationship, person, membership, covers, kind, status, valid_from, valid_to, ends_on, accepted);

select to_jsonb(now() - interval '3 days') as pia_lost,
       to_jsonb(now() - interval '5 days') as quim_lost,
       to_jsonb(now() - interval '6 days') as rosa_lost,
       to_jsonb(now() - interval '4 days') as sol_lost,
       to_jsonb((current_date - 2)::timestamptz) as tea_lost,
       to_jsonb(now() - interval '1 day') as uma_lost,
       to_jsonb(now() - interval '29 days') as wes_lost,
       to_jsonb(now() - interval '2 days') as zoe_lost \gset

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_token', '', true);
end
$$;

create function pg_temp.card(person uuid) returns jsonb language sql as $$
  select relationships.read_client_card(
    '019ae300-0000-7000-8000-000000000012', '019ae300-0000-7000-8000-000000000101', person)
$$;

set local role allfit_api;
select pg_temp.act('019ae300-0000-7000-8000-000000000012');

select is(
  pg_temp.card('019ae300-0000-7000-8000-000000000001'),
  jsonb_build_object(
    'kind', 'former',
    'person_id', '019ae300-0000-7000-8000-000000000001',
    'reason', 'relationship_ended',
    'lost_at', :'pia_lost'::jsonb),
  'she left the gym: that is the reason, at the instant she left, and nothing else'
);

select ok(
  current_setting('app.contract_scope_id', true) = ''
  and current_setting('app.contract_scope_purpose', true) = '',
  'the scope opened to read how the link ended is closed again'
);

select is(
  pg_temp.card('019ae300-0000-7000-8000-000000000002') - 'person_id',
  jsonb_build_object('kind', 'former', 'reason', 'assignment_ended', 'lost_at', :'quim_lost'::jsonb),
  'he was replaced while the link goes on: his attendance ended, she did not leave'
);

select is(
  pg_temp.card('019ae300-0000-7000-8000-000000000003') - 'person_id',
  jsonb_build_object('kind', 'former', 'reason', 'assignment_ended', 'lost_at', :'rosa_lost'::jsonb),
  'replaced before she left: he lost her when he was replaced, and is not told she left'
);

select is(
  pg_temp.card('019ae300-0000-7000-8000-000000000004') - 'person_id',
  jsonb_build_object('kind', 'former', 'reason', 'substitution_ended', 'lost_at', :'sol_lost'::jsonb),
  'a cover ended before its date is a cover that ended'
);

select is(
  pg_temp.card('019ae300-0000-7000-8000-000000000005') - 'person_id',
  jsonb_build_object('kind', 'former', 'reason', 'substitution_ended', 'lost_at', :'tea_lost'::jsonb),
  'a cover that ran out by its date ended when its last day did, though nothing was written'
);

select is(
  pg_temp.card('019ae300-0000-7000-8000-000000000006') - 'person_id',
  jsonb_build_object('kind', 'former', 'reason', 'relationship_ended', 'lost_at', :'uma_lost'::jsonb),
  'a cover still running when she left lost her because she left'
);

select is(
  pg_temp.card('019ae300-0000-7000-8000-000000000016') - 'person_id',
  jsonb_build_object('kind', 'former', 'reason', 'substitution_ended', 'lost_at', :'zoe_lost'::jsonb),
  'held and then covered: the last attendance he lost decides'
);

select throws_ok(
  $$select pg_temp.card('019ae300-0000-7000-8000-000000000007')$$,
  'P0002', 'client not found',
  'after thirty days nothing is said: she is nobody he can look up'
);

select is(
  pg_temp.card('019ae300-0000-7000-8000-000000000008')->>'reason',
  'relationship_ended',
  'within thirty days the reason is still said'
);

select throws_ok(
  $$select pg_temp.card('019ae300-0000-7000-8000-000000000009')$$,
  'P0002', 'client not found',
  'a cover she refused, or has not answered, was never attendance'
);

select is(
  (select array_agg(key order by key) from jsonb_object_keys(
     pg_temp.card('019ae300-0000-7000-8000-000000000001')) as key),
  array['kind', 'lost_at', 'person_id', 'reason'],
  'a former client''s card carries no name, no relationship and no permission'
);

select pg_temp.card('019ae300-0000-7000-8000-000000000010') as yan_before \gset

-- Yan comes back to the gym five days ago, now with Diana.
reset role;
insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values ('019ae300-0000-7000-8000-000000000720', '019ae300-0000-7000-8000-000000000010',
        '019ae300-0000-7000-8000-000000000101', 'active', now() - interval '5 days');
insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status, valid_from
) values ('019ae300-0000-7000-8000-000000000820', '019ae300-0000-7000-8000-000000000720',
  '019ae300-0000-7000-8000-000000000010', '019ae300-0000-7000-8000-000000000101',
  '019ae300-0000-7000-8000-000000000213', 'holder', 'active', now() - interval '5 days');
set local role allfit_api;
select pg_temp.act('019ae300-0000-7000-8000-000000000012');

select is(
  pg_temp.card('019ae300-0000-7000-8000-000000000010'),
  :'yan_before'::jsonb,
  'her coming back with another coach changes nothing he is told'
);

select pg_temp.act('019ae300-0000-7000-8000-000000000014');

select is(
  relationships.read_client_card(
    '019ae300-0000-7000-8000-000000000014', '019ae300-0000-7000-8000-000000000101',
    '019ae300-0000-7000-8000-000000000017') - 'person_id',
  jsonb_build_object('kind', 'former', 'reason', 'substitution_ended', 'lost_at', :'tea_lost'::jsonb),
  'seeing every client from the desk does not stretch a cover past its last day'
);

select pg_temp.act('019ae300-0000-7000-8000-000000000013');
select throws_ok(
  $$select relationships.read_client_card(
    '019ae300-0000-7000-8000-000000000013', '019ae300-0000-7000-8000-000000000101',
    '019ae300-0000-7000-8000-000000000001')$$,
  'P0002', 'client not found',
  'a coach who never attended her is told nothing about her'
);

select pg_temp.act('019ae300-0000-7000-8000-000000000011');
select throws_ok(
  $$select relationships.read_client_card(
    '019ae300-0000-7000-8000-000000000011', '019ae300-0000-7000-8000-000000000101',
    '019ae300-0000-7000-8000-000000000001')$$,
  'P0002', 'client not found',
  'nor is the owner'
);

reset role;

select is(
  (select count(*) from privacy.access_events
    where subject_person_id::text like '019ae300-0000-7000-8000-0000000000%'),
  0::bigint,
  'telling him why writes no access event: it reads none of her data'
);

select is(
  (select cmd || ' ' || array_to_string(roles, ',') from pg_policies
    where schemaname = 'relationships' and tablename = 'service_relationships'
      and policyname = 'service_relationships_select_former_attendance'),
  'SELECT allfit_owner',
  'the former attendance policy reads, and only for the owner role the definers run as'
);

select ok(
  (select qual like '%( SELECT access_control.contract_scope(''former_attendance''::text)%'
     from pg_policies
    where schemaname = 'relationships' and tablename = 'service_relationships'
      and policyname = 'service_relationships_select_former_attendance'),
  'its predicate reads the contract scope once per statement'
);

select * from finish();

rollback;
