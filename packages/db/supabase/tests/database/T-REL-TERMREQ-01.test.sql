-- T-REL-TERMREQ-01 — OP-REL-009, OP-REL-017, OP-REL-018 (HU-STUDIO-033).
--
-- A coach asks the gym to end a relationship. What weighs most:
--
--   · Asking changes nothing: the relationship and every assignment are exactly
--     as they were (criterion 1).
--   · Whoever could end it herself is refused, and so is anybody who is not the
--     holder (criteria 2 and 3).
--   · Two pending requests are impossible, and the database is what says so
--     (criterion 4).
--   · The person never sees it, and neither do staff or another coach (criterion 5).
--   · Every request ends settled with who and when (criterion 7) — by refusal, by
--     withdrawal, and by each of the five changes that overtake it: the gym ending
--     the relationship, the person ending it, a reassignment, a resignation and the
--     organization closing. Those last ones run as actors who cannot see the
--     request, which is exactly what the settlement scope exists for.

begin;

select plan(37);

insert into identity.people (id, given_name, family_name, status, contact_email)
values
  ('019d1200-0000-7000-8000-000000000001', 'Ana', 'Cliente', 'active', 'ana@example.test'),
  ('019d1200-0000-7000-8000-000000000002', 'Bruno', 'Cliente', 'active', null),
  ('019d1200-0000-7000-8000-000000000003', 'Carla', 'Cliente', 'active', 'carla@example.test'),
  ('019d1200-0000-7000-8000-000000000004', 'Dario', 'Cliente', 'active', null),
  ('019d1200-0000-7000-8000-000000000005', 'Eva', 'Cliente', 'active', null),
  ('019d1200-0000-7000-8000-000000000006', 'Fabio', 'Cliente', 'active', null),
  ('019d1200-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active', 'olivia@example.test'),
  ('019d1200-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active', 'camilo@example.test'),
  ('019d1200-0000-7000-8000-000000000013', 'Diana', 'Coach', 'active', 'diana@example.test'),
  ('019d1200-0000-7000-8000-000000000014', 'Sara', 'Staff', 'active', 'sara@example.test'),
  ('019d1200-0000-7000-8000-000000000015', 'Elena', 'Ajena', 'active', null),
  ('019d1200-0000-7000-8000-000000000016', 'Adri', 'Admin', 'active', 'adri@example.test'),
  ('019d1200-0000-7000-8000-000000000017', 'Owen', 'Owner', 'active', null),
  ('019d1200-0000-7000-8000-000000000018', 'Coco', 'Coach', 'active', null);

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019d1200-0000-7000-8000-000000000101', 'gym', 'Request Gym',
    '{"party_kind":"legal_entity","party_name":"Request SAS","purpose":"studio_operations"}'),
  ('019d1200-0000-7000-8000-000000000102', 'gym', 'Otro Gym',
    '{"party_kind":"legal_entity","party_name":"Otro SAS","purpose":"studio_operations"}'),
  ('019d1200-0000-7000-8000-000000000103', 'gym', 'Closing Gym',
    '{"party_kind":"legal_entity","party_name":"Closing SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019d1200-0000-7000-8000-000000000201', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000011', 'active'),
  ('019d1200-0000-7000-8000-000000000202', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000012', 'active'),
  ('019d1200-0000-7000-8000-000000000203', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000013', 'active'),
  ('019d1200-0000-7000-8000-000000000204', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000014', 'active'),
  ('019d1200-0000-7000-8000-000000000205', '019d1200-0000-7000-8000-000000000102',
    '019d1200-0000-7000-8000-000000000015', 'active'),
  ('019d1200-0000-7000-8000-000000000206', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000016', 'active'),
  ('019d1200-0000-7000-8000-000000000207', '019d1200-0000-7000-8000-000000000103',
    '019d1200-0000-7000-8000-000000000017', 'active'),
  ('019d1200-0000-7000-8000-000000000208', '019d1200-0000-7000-8000-000000000103',
    '019d1200-0000-7000-8000-000000000018', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019d1200-0000-7000-8000-000000000201', 'owner'),
  ('019d1200-0000-7000-8000-000000000202', 'coach'),
  ('019d1200-0000-7000-8000-000000000203', 'coach'),
  ('019d1200-0000-7000-8000-000000000204', 'staff'),
  ('019d1200-0000-7000-8000-000000000205', 'owner'),
  ('019d1200-0000-7000-8000-000000000206', 'admin'),
  -- Adri also coaches: the holder criterion 3 is about.
  ('019d1200-0000-7000-8000-000000000206', 'coach'),
  ('019d1200-0000-7000-8000-000000000207', 'owner'),
  ('019d1200-0000-7000-8000-000000000208', 'coach');

-- 701 is the main stage; 702–705 each end one way; Adri holds 706.
insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values
  ('019d1200-0000-7000-8000-000000000701', '019d1200-0000-7000-8000-000000000001',
    '019d1200-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days'),
  ('019d1200-0000-7000-8000-000000000702', '019d1200-0000-7000-8000-000000000002',
    '019d1200-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days'),
  ('019d1200-0000-7000-8000-000000000703', '019d1200-0000-7000-8000-000000000003',
    '019d1200-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days'),
  ('019d1200-0000-7000-8000-000000000704', '019d1200-0000-7000-8000-000000000004',
    '019d1200-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days'),
  ('019d1200-0000-7000-8000-000000000705', '019d1200-0000-7000-8000-000000000005',
    '019d1200-0000-7000-8000-000000000103', 'active', clock_timestamp() - interval '30 days'),
  ('019d1200-0000-7000-8000-000000000706', '019d1200-0000-7000-8000-000000000006',
    '019d1200-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status, valid_from
) values
  ('019d1200-0000-7000-8000-000000000801', '019d1200-0000-7000-8000-000000000701',
    '019d1200-0000-7000-8000-000000000001', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000202', 'holder', 'active', clock_timestamp() - interval '29 days'),
  ('019d1200-0000-7000-8000-000000000803', '019d1200-0000-7000-8000-000000000702',
    '019d1200-0000-7000-8000-000000000002', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000202', 'holder', 'active', clock_timestamp() - interval '29 days'),
  ('019d1200-0000-7000-8000-000000000804', '019d1200-0000-7000-8000-000000000703',
    '019d1200-0000-7000-8000-000000000003', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000202', 'holder', 'active', clock_timestamp() - interval '29 days'),
  ('019d1200-0000-7000-8000-000000000805', '019d1200-0000-7000-8000-000000000704',
    '019d1200-0000-7000-8000-000000000004', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000202', 'holder', 'active', clock_timestamp() - interval '29 days'),
  ('019d1200-0000-7000-8000-000000000806', '019d1200-0000-7000-8000-000000000705',
    '019d1200-0000-7000-8000-000000000005', '019d1200-0000-7000-8000-000000000103',
    '019d1200-0000-7000-8000-000000000208', 'holder', 'active', clock_timestamp() - interval '29 days'),
  ('019d1200-0000-7000-8000-000000000807', '019d1200-0000-7000-8000-000000000706',
    '019d1200-0000-7000-8000-000000000006', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000206', 'holder', 'active', clock_timestamp() - interval '29 days');

-- Diana covers Camilo on 701, accepted: she sees the relationship and is not its holder.
insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id,
  covers_membership_id, kind, status, valid_from, ends_on, accepted_by_person_at
) values (
  '019d1200-0000-7000-8000-000000000802', '019d1200-0000-7000-8000-000000000701',
  '019d1200-0000-7000-8000-000000000001', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000203', '019d1200-0000-7000-8000-000000000202',
  'substitute', 'active', clock_timestamp() - interval '1 day',
  (clock_timestamp() + interval '10 days')::date, clock_timestamp() - interval '1 day'
);

create temporary table outcomes (label text primary key, result jsonb, replayed boolean);
create temporary table before_asking as
select relationship.id, relationship.status, relationship.updated_at,
       (select jsonb_agg(to_jsonb(assignment) order by assignment.id)
        from relationships.relationship_professional_assignments as assignment
        where assignment.relationship_id = relationship.id) as assignments
from relationships.service_relationships as relationship
where relationship.id = '019d1200-0000-7000-8000-000000000701';
grant all on outcomes, before_asking to allfit_api, allfit_owner;

create function pg_temp.act_as(p_person text) returns void language sql as $f$
  select set_config('app.actor_kind', 'person', true),
         set_config('app.actor_person_id', p_person, true),
         set_config('app.actor_org_id', '', true),
         set_config('app.request_id', gen_random_uuid()::text, true);
$f$;
grant execute on function pg_temp.act_as(text) to allfit_api, allfit_owner;

set local role allfit_api;

-- ———————————————————————————————————— Who may ask (OP-REL-009)

select pg_temp.act_as('019d1200-0000-7000-8000-000000000011');
select throws_ok(
  $q$select * from relationships.request_relationship_termination(
    '019d1200-0000-7000-8000-000000000011', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701', null,
    '019d1200-0000-4000-8000-000000000901', '019d1200-0000-7000-8000-000000000901',
    extensions.digest('owner-asks', 'sha256'))$q$,
  '42501', null,
  'T-REL-TERMREQ-RLS-01: an owner does not ask, she ends it'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000016');
select throws_ok(
  $q$select * from relationships.request_relationship_termination(
    '019d1200-0000-7000-8000-000000000016', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000706', null,
    '019d1200-0000-4000-8000-000000000902', '019d1200-0000-7000-8000-000000000902',
    extensions.digest('admin-asks', 'sha256'))$q$,
  '42501', null,
  'T-REL-TERMREQ-RLS-02: nor does an administrator who holds the relationship herself'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000014');
select throws_ok(
  $q$select * from relationships.request_relationship_termination(
    '019d1200-0000-7000-8000-000000000014', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701', null,
    '019d1200-0000-4000-8000-000000000903', '019d1200-0000-7000-8000-000000000903',
    extensions.digest('staff-asks', 'sha256'))$q$,
  '42501', null,
  'T-REL-TERMREQ-RLS-03: staff read the directory and hold no relationship to ask about'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000013');
select throws_ok(
  $q$select * from relationships.request_relationship_termination(
    '019d1200-0000-7000-8000-000000000013', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701', null,
    '019d1200-0000-4000-8000-000000000904', '019d1200-0000-7000-8000-000000000904',
    extensions.digest('cover-asks', 'sha256'))$q$,
  '42501', null,
  'T-REL-TERMREQ-RLS-04: a cover sees the relationship and is not its holder'
);

select throws_ok(
  $q$select * from relationships.request_relationship_termination(
    '019d1200-0000-7000-8000-000000000013', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000703', null,
    '019d1200-0000-4000-8000-000000000905', '019d1200-0000-7000-8000-000000000905',
    extensions.digest('stranger-asks', 'sha256'))$q$,
  'P0002', null,
  'T-REL-TERMREQ-RLS-05: a coach with no assignment is told the relationship does not exist'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000015');
select throws_ok(
  $q$select * from relationships.request_relationship_termination(
    '019d1200-0000-7000-8000-000000000015', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701', null,
    '019d1200-0000-4000-8000-000000000906', '019d1200-0000-7000-8000-000000000906',
    extensions.digest('outsider-asks', 'sha256'))$q$,
  '42501', null,
  'T-REL-TERMREQ-RLS-06: another organization asks about nothing here'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000012');
select throws_ok(
  $q$select * from relationships.request_relationship_termination(
    '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701', repeat('x', 2001),
    '019d1200-0000-4000-8000-000000000907', '019d1200-0000-7000-8000-000000000907',
    extensions.digest('long-reason', 'sha256'))$q$,
  '22023', null,
  'T-REL-TERMREQ-INT-01: a reason is at most 2000 characters'
);

-- ———————————————————————————————————— The holder asks

insert into outcomes
select 'asked', * from relationships.request_relationship_termination(
  '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000701', '  No puedo seguir atendiéndola  ',
  '019d1200-0000-4000-8000-000000000910', '019d1200-0000-7000-8000-000000000910',
  extensions.digest('camilo-asks', 'sha256'));

select is(
  (select result - 'request_id' - 'created_at' from outcomes where label = 'asked'),
  jsonb_build_object(
    'relationship_id', '019d1200-0000-7000-8000-000000000701',
    'status', 'pending', 'reason', 'No puedo seguir atendiéndola', 'resolution', null,
    'requested_by', jsonb_build_object(
      'membership_id', '019d1200-0000-7000-8000-000000000202', 'display_name', 'Camilo Coach'),
    'resolved_by', null, 'resolved_at', null),
  'T-REL-TERMREQ-INT-02: the holder asks, and the request stands pending with her reason'
);

reset role;

select is(
  (select jsonb_build_object('status', relationship.status, 'updated_at', relationship.updated_at,
     'assignments', (select jsonb_agg(to_jsonb(assignment) order by assignment.id)
                     from relationships.relationship_professional_assignments as assignment
                     where assignment.relationship_id = relationship.id))
   from relationships.service_relationships as relationship
   where relationship.id = '019d1200-0000-7000-8000-000000000701'),
  (select jsonb_build_object('status', status, 'updated_at', updated_at, 'assignments', assignments)
   from before_asking),
  'T-REL-TERMREQ-INT-03: asking changed nothing about the relationship or who attends it'
);

select is(
  (select event.payload -> 'recipients'
   from system.outbox_events as event
   where event.event_type = 'relationship.termination_requested.v1'
     and event.aggregate_id = (select (result ->> 'request_id')::uuid from outcomes where label = 'asked')),
  '["adri@example.test", "olivia@example.test"]'::jsonb,
  'T-REL-TERMREQ-INT-04: the notice goes to whoever could end it, and to nobody else'
);

set local role allfit_api;
select pg_temp.act_as('019d1200-0000-7000-8000-000000000012');

insert into outcomes
select 'asked-again', * from relationships.request_relationship_termination(
  '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000701', '  No puedo seguir atendiéndola  ',
  '019d1200-0000-4000-8000-000000000910', '019d1200-0000-7000-8000-000000000910',
  extensions.digest('camilo-asks', 'sha256'));

select is(
  (select jsonb_build_object('same', again.result ->> 'request_id' = first.result ->> 'request_id',
                             'replayed', again.replayed)
   from outcomes as again, outcomes as first
   where again.label = 'asked-again' and first.label = 'asked'),
  '{"same": true, "replayed": true}'::jsonb,
  'T-REL-TERMREQ-IDEM-01: the same key answers with the same request'
);

select throws_ok(
  $q$select * from relationships.request_relationship_termination(
    '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701', null,
    '019d1200-0000-4000-8000-000000000911', '019d1200-0000-7000-8000-000000000911',
    extensions.digest('camilo-asks-twice', 'sha256'))$q$,
  '23505', null,
  'T-REL-TERMREQ-INT-05: a second pending request on the same relationship is impossible'
);

-- ———————————————————————————————————— Who sees it (criterion 5)

set local role allfit_owner;

select pg_temp.act_as('019d1200-0000-7000-8000-000000000001');
select is(
  (select count(*)::integer from relationships.relationship_termination_requests),
  0,
  'T-REL-TERMREQ-RLS-07: the person attended does not see the request'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000014');
select set_config('app.actor_org_id', '019d1200-0000-7000-8000-000000000101', true);
select is(
  (select count(*)::integer from relationships.relationship_termination_requests),
  0,
  'T-REL-TERMREQ-RLS-08: neither do staff'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000013');
select set_config('app.actor_org_id', '019d1200-0000-7000-8000-000000000101', true);
select is(
  (select count(*)::integer from relationships.relationship_termination_requests),
  0,
  'T-REL-TERMREQ-RLS-09: nor another coach, even one covering the same client'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000011');
select set_config('app.actor_org_id', '019d1200-0000-7000-8000-000000000101', true);
select is(
  (select count(*)::integer from relationships.relationship_termination_requests),
  1,
  'T-REL-TERMREQ-RLS-10: the owner sees it'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000012');
select set_config('app.actor_org_id', '019d1200-0000-7000-8000-000000000101', true);
select is(
  (select count(*)::integer from relationships.relationship_termination_requests),
  1,
  'T-REL-TERMREQ-RLS-11: and so does the coach who asked'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000013');
select set_config('app.actor_org_id', '019d1200-0000-7000-8000-000000000101', true);
select throws_ok(
  $q$insert into relationships.relationship_termination_requests
       (relationship_id, organization_id, requested_by_membership_id)
     values ('019d1200-0000-7000-8000-000000000702', '019d1200-0000-7000-8000-000000000101',
             '019d1200-0000-7000-8000-000000000202')$q$,
  '42501', null,
  'T-REL-TERMREQ-RLS-12: nobody asks in another coach''s name'
);

-- ———————————————————————————————————— The relationship says so (OP-REL-011)

set local role allfit_api;

select pg_temp.act_as('019d1200-0000-7000-8000-000000000012');
select is(
  relationships.read_relationship_state(
    '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701') -> 'termination_request' ->> 'status',
  'pending',
  'T-REL-TERMREQ-RLS-13: the coach reads her pending request on the relationship'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000014');
select is(
  relationships.read_relationship_state(
    '019d1200-0000-7000-8000-000000000014', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701') -> 'termination_request',
  'null'::jsonb,
  'T-REL-TERMREQ-RLS-14: staff read the relationship and not the deliberation'
);

-- ———————————————————————————————————— Refusing it (OP-REL-018)

select pg_temp.act_as('019d1200-0000-7000-8000-000000000012');
select throws_ok(
  format($q$select * from relationships.reject_termination_request(
    '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701', %L, 'Me rechazo',
    '019d1200-0000-4000-8000-000000000920', '019d1200-0000-7000-8000-000000000920',
    extensions.digest('coach-rejects', 'sha256'))$q$,
    (select result ->> 'request_id' from outcomes where label = 'asked')),
  '42501', null,
  'T-REL-TERMREQ-RLS-15: the coach does not refuse her own request'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000011');
select throws_ok(
  format($q$select * from relationships.reject_termination_request(
    '019d1200-0000-7000-8000-000000000011', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701', %L, '   ',
    '019d1200-0000-4000-8000-000000000921', '019d1200-0000-7000-8000-000000000921',
    extensions.digest('blank-refusal', 'sha256'))$q$,
    (select result ->> 'request_id' from outcomes where label = 'asked')),
  '22023', null,
  'T-REL-TERMREQ-INT-06: a refusal says why'
);

insert into outcomes
select 'rejected', * from relationships.reject_termination_request(
  '019d1200-0000-7000-8000-000000000011', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000701',
  (select (result ->> 'request_id')::uuid from outcomes where label = 'asked'),
  'Ana pidió seguir contigo hasta fin de mes',
  '019d1200-0000-4000-8000-000000000922', '019d1200-0000-7000-8000-000000000922',
  extensions.digest('owner-rejects', 'sha256'));

select is(
  (select jsonb_build_object(
     'status', result ->> 'status', 'resolution', result ->> 'resolution',
     'resolved_by', result -> 'resolved_by' ->> 'membership_id',
     'resolved_at_set', result ->> 'resolved_at' is not null)
   from outcomes where label = 'rejected'),
  jsonb_build_object('status', 'rejected', 'resolution', 'Ana pidió seguir contigo hasta fin de mes',
    'resolved_by', '019d1200-0000-7000-8000-000000000201', 'resolved_at_set', true),
  'T-REL-TERMREQ-INT-07: the owner refuses in words, and who and when are recorded'
);

reset role;
select is(
  (select event.payload ->> 'contact_email'
   from system.outbox_events as event
   where event.event_type = 'relationship.termination_request_rejected.v1'
     and event.aggregate_id = (select (result ->> 'request_id')::uuid from outcomes where label = 'asked')),
  'camilo@example.test',
  'T-REL-TERMREQ-INT-08: the coach who asked is told'
);
set local role allfit_api;
select pg_temp.act_as('019d1200-0000-7000-8000-000000000011');

insert into outcomes
select 'rejected-again', * from relationships.reject_termination_request(
  '019d1200-0000-7000-8000-000000000011', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000701',
  (select (result ->> 'request_id')::uuid from outcomes where label = 'asked'),
  'Ana pidió seguir contigo hasta fin de mes',
  '019d1200-0000-4000-8000-000000000922', '019d1200-0000-7000-8000-000000000922',
  extensions.digest('owner-rejects', 'sha256'));

select is(
  (select jsonb_build_object('status', result ->> 'status', 'replayed', replayed)
   from outcomes where label = 'rejected-again'),
  '{"status": "rejected", "replayed": true}'::jsonb,
  'T-REL-TERMREQ-IDEM-02: the same refusal replays'
);

select throws_ok(
  format($q$select * from relationships.reject_termination_request(
    '019d1200-0000-7000-8000-000000000011', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701', %L, 'Otra vez',
    '019d1200-0000-4000-8000-000000000923', '019d1200-0000-7000-8000-000000000923',
    extensions.digest('owner-rejects-twice', 'sha256'))$q$,
    (select result ->> 'request_id' from outcomes where label = 'asked')),
  'P0004', null,
  'T-REL-TERMREQ-INT-09: a settled request is not refused again'
);

-- ———————————————————————————————————— Taking it back (OP-REL-017)

select pg_temp.act_as('019d1200-0000-7000-8000-000000000012');
insert into outcomes
select 'asked-after-refusal', * from relationships.request_relationship_termination(
  '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000701', null,
  '019d1200-0000-4000-8000-000000000930', '019d1200-0000-7000-8000-000000000930',
  extensions.digest('camilo-asks-later', 'sha256'));

select is(
  (select result ->> 'status' from outcomes where label = 'asked-after-refusal'),
  'pending',
  'T-REL-TERMREQ-INT-10: a refused request does not stop the coach asking again'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000011');
select throws_ok(
  format($q$select * from relationships.withdraw_termination_request(
    '019d1200-0000-7000-8000-000000000011', '019d1200-0000-7000-8000-000000000101',
    '019d1200-0000-7000-8000-000000000701', %L,
    '019d1200-0000-4000-8000-000000000931', '019d1200-0000-7000-8000-000000000931',
    extensions.digest('owner-withdraws', 'sha256'))$q$,
    (select result ->> 'request_id' from outcomes where label = 'asked-after-refusal')),
  '42501', null,
  'T-REL-TERMREQ-RLS-16: only the coach who asked takes it back'
);

select pg_temp.act_as('019d1200-0000-7000-8000-000000000012');
insert into outcomes
select 'withdrawn', * from relationships.withdraw_termination_request(
  '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000701',
  (select (result ->> 'request_id')::uuid from outcomes where label = 'asked-after-refusal'),
  '019d1200-0000-4000-8000-000000000932', '019d1200-0000-7000-8000-000000000932',
  extensions.digest('camilo-withdraws', 'sha256'));

select is(
  (select jsonb_build_object('status', result ->> 'status',
     'resolved_by', result -> 'resolved_by' ->> 'membership_id', 'replayed', replayed)
   from outcomes where label = 'withdrawn'),
  '{"status": "withdrawn", "resolved_by": "019d1200-0000-7000-8000-000000000202", "replayed": false}'::jsonb,
  'T-REL-TERMREQ-INT-11: she takes it back, and she is who settled it'
);

insert into outcomes
select 'withdrawn-again', * from relationships.withdraw_termination_request(
  '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000701',
  (select (result ->> 'request_id')::uuid from outcomes where label = 'asked-after-refusal'),
  '019d1200-0000-4000-8000-000000000933', '019d1200-0000-7000-8000-000000000933',
  extensions.digest('camilo-withdraws-twice', 'sha256'));

select is(
  (select jsonb_build_object('status', result ->> 'status', 'replayed', replayed)
   from outcomes where label = 'withdrawn-again'),
  '{"status": "withdrawn", "replayed": true}'::jsonb,
  'T-REL-TERMREQ-IDEM-03: withdrawing what is withdrawn converges under a new key'
);

insert into outcomes
select 'withdrawn-replay', * from relationships.withdraw_termination_request(
  '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000701',
  (select (result ->> 'request_id')::uuid from outcomes where label = 'asked-after-refusal'),
  '019d1200-0000-4000-8000-000000000932', '019d1200-0000-7000-8000-000000000932',
  extensions.digest('camilo-withdraws', 'sha256'));

select is(
  (select replayed from outcomes where label = 'withdrawn-replay'),
  true,
  'T-REL-TERMREQ-IDEM-04: and the same key replays'
);

-- ———————————————————————————————————— Overtaken by events (criterion 7)

-- The gym ends it: resolved, by the administrator who did, at the relationship's T.
insert into outcomes
select 'before-ending', * from relationships.request_relationship_termination(
  '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000701', null,
  '019d1200-0000-4000-8000-000000000940', '019d1200-0000-7000-8000-000000000940',
  extensions.digest('camilo-asks-701', 'sha256'));

select pg_temp.act_as('019d1200-0000-7000-8000-000000000016');
select * from relationships.terminate_relationship(
  '019d1200-0000-7000-8000-000000000016', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000701', null,
  '019d1200-0000-4000-8000-000000000941', '019d1200-0000-7000-8000-000000000941',
  extensions.digest('admin-ends-701', 'sha256'));

-- Asked from 702, 703 and 704 now, before any of them is overtaken.
select pg_temp.act_as('019d1200-0000-7000-8000-000000000012');
insert into outcomes
select 'asked-702', * from relationships.request_relationship_termination(
  '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000702', null,
  '019d1200-0000-4000-8000-000000000950', '019d1200-0000-7000-8000-000000000950',
  extensions.digest('camilo-asks-702', 'sha256'));
insert into outcomes
select 'asked-703', * from relationships.request_relationship_termination(
  '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000703', null,
  '019d1200-0000-4000-8000-000000000951', '019d1200-0000-7000-8000-000000000951',
  extensions.digest('camilo-asks-703', 'sha256'));
insert into outcomes
select 'asked-704', * from relationships.request_relationship_termination(
  '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000704', null,
  '019d1200-0000-4000-8000-000000000952', '019d1200-0000-7000-8000-000000000952',
  extensions.digest('camilo-asks-704', 'sha256'));

select pg_temp.act_as('019d1200-0000-7000-8000-000000000018');
insert into outcomes
select 'asked-705', * from relationships.request_relationship_termination(
  '019d1200-0000-7000-8000-000000000018', '019d1200-0000-7000-8000-000000000103',
  '019d1200-0000-7000-8000-000000000705', null,
  '019d1200-0000-4000-8000-000000000953', '019d1200-0000-7000-8000-000000000953',
  extensions.digest('coco-asks-705', 'sha256'));

-- The person ends 702 herself.
select pg_temp.act_as('019d1200-0000-7000-8000-000000000002');
select * from relationships.end_my_relationship(
  '019d1200-0000-7000-8000-000000000002', '019d1200-0000-7000-8000-000000000702', null,
  '019d1200-0000-4000-8000-000000000960', '019d1200-0000-7000-8000-000000000960',
  extensions.digest('bruno-ends', 'sha256'));

-- The owner hands 703 to Diana.
select pg_temp.act_as('019d1200-0000-7000-8000-000000000011');
select * from relationships.reassign_relationship_holder(
  '019d1200-0000-7000-8000-000000000011', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-7000-8000-000000000703', '019d1200-0000-7000-8000-000000000203',
  '019d1200-0000-4000-8000-000000000961', '019d1200-0000-7000-8000-000000000961',
  extensions.digest('owner-reassigns-703', 'sha256'));

-- Camilo resigns, which ends what he still holds: 704.
select pg_temp.act_as('019d1200-0000-7000-8000-000000000012');
select * from organizations.resign_membership(
  '019d1200-0000-7000-8000-000000000012', '019d1200-0000-7000-8000-000000000101',
  '019d1200-0000-4000-8000-000000000962', '019d1200-0000-7000-8000-000000000962',
  extensions.digest('camilo-resigns', 'sha256'));

-- And Closing Gym closes, with 705's request pending.
select pg_temp.act_as('019d1200-0000-7000-8000-000000000017');
select * from organizations.close_organization(
  '019d1200-0000-7000-8000-000000000017', '019d1200-0000-7000-8000-000000000103',
  '019d1200-0000-4000-8000-000000000963', '019d1200-0000-7000-8000-000000000963',
  extensions.digest('owen-closes', 'sha256'));

reset role;

create temporary table settled as
select outcome.label, request.status::text as status, request.resolved_by_membership_id,
       request.resolved_at = relationship.ended_at as at_the_end
from outcomes as outcome
join relationships.relationship_termination_requests as request
  on request.id = (outcome.result ->> 'request_id')::uuid
join relationships.service_relationships as relationship on relationship.id = request.relationship_id
where outcome.label in ('before-ending', 'asked-702', 'asked-703', 'asked-704', 'asked-705');

select is(
  (select jsonb_build_object('status', status, 'by', resolved_by_membership_id, 'at_t', at_the_end)
   from settled where label = 'before-ending'),
  '{"status": "resolved", "by": "019d1200-0000-7000-8000-000000000206", "at_t": true}'::jsonb,
  'T-REL-TERMREQ-INT-12: the gym ending it resolves it, by the administrator, at T'
);

select is(
  (select jsonb_build_object('status', status, 'by', resolved_by_membership_id, 'at_t', at_the_end)
   from settled where label = 'asked-702'),
  '{"status": "superseded", "by": null, "at_t": true}'::jsonb,
  'T-REL-TERMREQ-INT-13: the person ending it supersedes it, though she cannot see it'
);

select is(
  (select jsonb_build_object('status', status, 'by', resolved_by_membership_id)
   from settled where label = 'asked-703'),
  '{"status": "superseded", "by": null}'::jsonb,
  'T-REL-TERMREQ-INT-14: a reassignment supersedes it, and the relationship goes on'
);

select is(
  (select jsonb_build_object('status', status, 'by', resolved_by_membership_id)
   from settled where label = 'asked-704'),
  '{"status": "superseded", "by": null}'::jsonb,
  'T-REL-TERMREQ-INT-15: so does the coach resigning from the organization'
);

select is(
  (select jsonb_build_object('status', status, 'by', resolved_by_membership_id, 'at_t', at_the_end)
   from settled where label = 'asked-705'),
  '{"status": "resolved", "by": "019d1200-0000-7000-8000-000000000207", "at_t": true}'::jsonb,
  'T-REL-TERMREQ-INT-16: and an organization closing resolves it, by its owner'
);

select is(
  (select count(*)::integer from relationships.relationship_termination_requests as request
   join outcomes on (outcomes.result ->> 'request_id')::uuid = request.id
   where request.status = 'pending'),
  0,
  'T-REL-TERMREQ-INT-17: nothing is left pending behind a change that overtook it'
);

select * from finish();
rollback;
