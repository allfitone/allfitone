-- T-PRV-ACCESSLOG-01 — OP-PRV-015, a person reads who read her data (HU-STUDIO-083 c3).
--
-- Every read of her data writes an access event; this is where she sees them.
--
--   · The real person who read, not only the organization; covers and the Allfit One team
--     (break-glass and support) included, and refused attempts too.
--   · Twenty-four months, newest first, ties broken by id; her own reads are not listed.
--   · Only her own events: the function is closed and the table stays unreadable.
--   · Reading the log is not itself an access to be logged.
begin;

select plan(21);

insert into identity.people (id, given_name, family_name, status)
values
  ('019ae400-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019ae400-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019ae400-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019ae400-0000-7000-8000-000000000013', 'Diana', 'Cover', 'active'),
  ('019ae400-0000-7000-8000-000000000031', 'Sofia', 'Support', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019ae400-0000-7000-8000-000000000101', 'gym', 'Gym Norte',
  '{"party_kind":"legal_entity","party_name":"Norte SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019ae400-0000-7000-8000-000000000212', '019ae400-0000-7000-8000-000000000101', '019ae400-0000-7000-8000-000000000012', 'active'),
  ('019ae400-0000-7000-8000-000000000213', '019ae400-0000-7000-8000-000000000101', '019ae400-0000-7000-8000-000000000013', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019ae400-0000-7000-8000-000000000212', 'coach'),
  ('019ae400-0000-7000-8000-000000000213', 'coach');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values
  ('019ae400-0000-7000-8000-000000000701', '019ae400-0000-7000-8000-000000000001', '019ae400-0000-7000-8000-000000000101', 'active', now() - interval '90 days'),
  ('019ae400-0000-7000-8000-000000000702', '019ae400-0000-7000-8000-000000000002', '019ae400-0000-7000-8000-000000000101', 'active', now() - interval '90 days');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, valid_from, ends_on, accepted_by_person_at
) values
  ('019ae400-0000-7000-8000-000000000801', '019ae400-0000-7000-8000-000000000701', '019ae400-0000-7000-8000-000000000001',
   '019ae400-0000-7000-8000-000000000101', '019ae400-0000-7000-8000-000000000212', null, 'holder', 'active',
   now() - interval '60 days', null, null),
  ('019ae400-0000-7000-8000-000000000802', '019ae400-0000-7000-8000-000000000701', '019ae400-0000-7000-8000-000000000001',
   '019ae400-0000-7000-8000-000000000101', '019ae400-0000-7000-8000-000000000213', '019ae400-0000-7000-8000-000000000212',
   'substitute', 'active', now() - interval '10 days', current_date + 10, now() - interval '10 days');

insert into privacy.access_events (
  id, actor_person_id, subject_person_id, resource, purpose, result, request_id, occurred_at,
  actor_membership_id, relationship_id, scope_code, scope_version, access_mode
)
select id, actor, subject, resource, purpose, result, gen_random_uuid(), at,
       membership, relationship, scope, version, mode::privacy.access_mode
from (values
  -- Ana's, newest first.
  ('019ae400-0000-7000-8000-000000000b02'::uuid, '019ae400-0000-7000-8000-000000000012'::uuid, '019ae400-0000-7000-8000-000000000001'::uuid,
   'execution.executed_sessions', 'studio_training_review', 'allowed', now() - interval '30 minutes',
   '019ae400-0000-7000-8000-000000000212'::uuid, '019ae400-0000-7000-8000-000000000701'::uuid, 'relationship_training', 1, 'live'),
  ('019ae400-0000-7000-8000-000000000b01', '019ae400-0000-7000-8000-000000000012', '019ae400-0000-7000-8000-000000000001',
   'execution.executed_sessions', 'studio_training_review', 'allowed', now() - interval '30 minutes',
   '019ae400-0000-7000-8000-000000000212', '019ae400-0000-7000-8000-000000000701', 'relationship_training', 1, 'live'),
  ('019ae400-0000-7000-8000-000000000e01', '019ae400-0000-7000-8000-000000000012', '019ae400-0000-7000-8000-000000000001',
   'identity.fitness_profile_claims', 'studio_profile_review', 'allowed', now() - interval '1 hour',
   '019ae400-0000-7000-8000-000000000212', '019ae400-0000-7000-8000-000000000701', 'relationship_training', 1, 'live'),
  ('019ae400-0000-7000-8000-000000000e02', '019ae400-0000-7000-8000-000000000013', '019ae400-0000-7000-8000-000000000001',
   'identity.body_progress_records', 'studio_body_review', 'allowed', now() - interval '2 hours',
   '019ae400-0000-7000-8000-000000000213', '019ae400-0000-7000-8000-000000000701', 'body_progress', 2, 'live'),
  ('019ae400-0000-7000-8000-000000000e03', '019ae400-0000-7000-8000-000000000012', '019ae400-0000-7000-8000-000000000001',
   'identity.health_context_claims', 'studio_health_review', 'denied', now() - interval '3 hours',
   '019ae400-0000-7000-8000-000000000212', '019ae400-0000-7000-8000-000000000701', 'health_context', null, 'live'),
  ('019ae400-0000-7000-8000-000000000e04', '019ae400-0000-7000-8000-000000000012', '019ae400-0000-7000-8000-000000000001',
   'execution.executed_sessions', 'studio_frozen_history', 'allowed', now() - interval '4 hours',
   '019ae400-0000-7000-8000-000000000212', '019ae400-0000-7000-8000-000000000701', 'relationship_training', 1, 'frozen'),
  ('019ae400-0000-7000-8000-000000000e05', '019ae400-0000-7000-8000-000000000031', '019ae400-0000-7000-8000-000000000001',
   'identity.people', 'support_break_glass', 'allowed', now() - interval '5 hours',
   null, null, null, null, 'break_glass'),
  ('019ae400-0000-7000-8000-000000000e06', '019ae400-0000-7000-8000-000000000031', '019ae400-0000-7000-8000-000000000001',
   'identity.people', 'support_person_search', 'allowed', now() - interval '6 hours',
   null, null, null, null, 'support_metadata'),
  -- Her own read, somebody else's, and two old enough to test the edge.
  ('019ae400-0000-7000-8000-000000000e07', '019ae400-0000-7000-8000-000000000001', '019ae400-0000-7000-8000-000000000001',
   'identity.body_progress_records', 'space_self_review', 'allowed', now() - interval '7 hours',
   null, null, null, null, 'live'),
  ('019ae400-0000-7000-8000-000000000e08', '019ae400-0000-7000-8000-000000000012', '019ae400-0000-7000-8000-000000000002',
   'execution.executed_sessions', 'studio_training_review', 'allowed', now() - interval '8 hours',
   '019ae400-0000-7000-8000-000000000212', '019ae400-0000-7000-8000-000000000702', 'relationship_training', 1, 'live'),
  ('019ae400-0000-7000-8000-000000000e09', '019ae400-0000-7000-8000-000000000012', '019ae400-0000-7000-8000-000000000001',
   'execution.executed_sessions', 'studio_training_review', 'allowed', now() - interval '25 months',
   '019ae400-0000-7000-8000-000000000212', '019ae400-0000-7000-8000-000000000701', 'relationship_training', 1, 'live'),
  ('019ae400-0000-7000-8000-000000000e10', '019ae400-0000-7000-8000-000000000012', '019ae400-0000-7000-8000-000000000001',
   'execution.executed_sessions', 'studio_training_review', 'allowed', now() - interval '23 months',
   '019ae400-0000-7000-8000-000000000212', '019ae400-0000-7000-8000-000000000701', 'relationship_training', 1, 'live')
) as event (id, actor, subject, resource, purpose, result, at, membership, relationship, scope, version, mode);

select (now() - interval '30 minutes')::text as tie_at,
       (now() - interval '2 hours')::text as diana_at \gset

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
end
$$;

set local role allfit_api;
select pg_temp.act('019ae400-0000-7000-8000-000000000001');

select is(
  (select array_agg(right(id::text, 3) order by occurred_at desc, id desc)
     from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 50, null, null)),
  array['b02', 'b01', 'e01', 'e02', 'e03', 'e04', 'e05', 'e06', 'e10'],
  'she sees every read of her data in two years, newest first, ties broken by the larger id'
);

select is(
  (select array_agg(right(id::text, 3))
     from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 50, null, null)),
  array['b02', 'b01', 'e01', 'e02', 'e03', 'e04', 'e05', 'e06', 'e10'],
  'and the function itself returns them in that order'
);

select is(
  (select row(actor_kind, actor_display_name, organization_id, organization_display_name,
              attendance, access_mode, scope_code, scope_version, resource, result)::text
     from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 50, null, null)
    where id = '019ae400-0000-7000-8000-000000000e01'),
  row('professional', 'Camilo Coach', '019ae400-0000-7000-8000-000000000101'::uuid, 'Gym Norte',
      'holder', 'live', 'relationship_training', 1, 'identity.fitness_profile_claims', 'allowed')::text,
  'a coach''s read says the person who read, the gym, that he holds her, the category and the version'
);

select is(
  (select attendance from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 50, null, null)
    where id = '019ae400-0000-7000-8000-000000000e02'),
  'substitute',
  'a cover''s read says it was a cover'
);

select is(
  (select result from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 50, null, null)
    where id = '019ae400-0000-7000-8000-000000000e03'),
  'denied',
  'a refused attempt is listed too, as refused'
);

select is(
  (select access_mode from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 50, null, null)
    where id = '019ae400-0000-7000-8000-000000000e04'),
  'frozen',
  'so is a read of a finished relationship''s history'
);

select is(
  (select row(actor_kind, actor_display_name, organization_id, attendance, access_mode)::text
     from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 50, null, null)
    where id = '019ae400-0000-7000-8000-000000000e05'),
  row('allfit_team', 'Sofia Support', null::uuid, null::text, 'break_glass')::text,
  'a break-glass access names the person on the Allfit One team who opened it'
);

select is(
  (select actor_kind || ':' || access_mode
     from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 50, null, null)
    where id = '019ae400-0000-7000-8000-000000000e06'),
  'allfit_team:support_metadata',
  'and so does a support search that found her'
);

select is(
  (select count(*) from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 50, null, null)
    where id in ('019ae400-0000-7000-8000-000000000e07', '019ae400-0000-7000-8000-000000000e08',
                 '019ae400-0000-7000-8000-000000000e09')),
  0::bigint,
  'not her own reads, not somebody else''s, and nothing older than twenty-four months'
);

select is(
  (select array_agg(right(id::text, 3))
     from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', 'body_progress', 50, null, null)),
  array['e02'],
  'she can narrow the log to one category'
);

select is(
  (select array_agg(right(id::text, 3))
     from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 2, null, null)),
  array['b02', 'b01'],
  'a page stops at its size'
);

select is(
  (select array_agg(right(id::text, 3))
     from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 2,
       :'tie_at'::timestamptz, '019ae400-0000-7000-8000-000000000b02')),
  array['b01', 'e01'],
  'the next page resumes inside a tie without skipping or repeating'
);

select is(
  (select array_agg(right(id::text, 3))
     from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 3,
       :'diana_at'::timestamptz, '019ae400-0000-7000-8000-000000000e02')),
  array['e03', 'e04', 'e05'],
  'and resumes after any row'
);

select throws_ok(
  $$select * from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000002', null, 50, null, null)$$,
  '42501', 'person actor mismatch',
  'nobody reads another person''s log'
);

select throws_ok(
  $$select * from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 0, null, null)$$,
  '22023', 'invalid page limit',
  'an empty page is not a page'
);

select throws_ok(
  $$select * from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 102, null, null)$$,
  '22023', 'invalid page limit',
  'nor is one over the cap'
);

select throws_ok(
  $$select * from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', null, 50, now(), null)$$,
  '22023', 'invalid access log cursor',
  'half a cursor is refused rather than resumed from nowhere'
);

select throws_ok(
  $$select * from privacy.list_my_access_events('019ae400-0000-7000-8000-000000000001', 'gossip', 50, null, null)$$,
  '22023', 'unknown scope',
  'a category nobody defined is refused'
);

reset role;

select is(
  (select count(*) from privacy.access_events where subject_person_id = '019ae400-0000-7000-8000-000000000001'),
  11::bigint,
  'reading her log wrote nothing to it'
);

select ok(
  not has_table_privilege('allfit_api', 'privacy.access_events', 'select')
  and has_function_privilege('allfit_api',
    'privacy.list_my_access_events(uuid, text, integer, timestamptz, uuid)', 'execute'),
  'the table stays closed to the API; only the function reads it'
);

select is(
  (select count(*) from pg_inherits as partition
    where partition.inhparent = 'privacy.access_events'::regclass
      and not exists (
        select 1 from pg_index as idx
        join pg_attribute as attribute
          on attribute.attrelid = idx.indrelid and attribute.attnum = idx.indkey[0]
        where idx.indrelid = partition.inhrelid and attribute.attname = 'subject_person_id')),
  0::bigint,
  'T-PRV-PHY every partition can find a person''s events by subject, newest first'
);

select * from finish();

rollback;
