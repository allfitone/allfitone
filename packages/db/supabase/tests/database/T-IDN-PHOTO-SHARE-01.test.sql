-- T-IDN-PHOTO-SHARE-01 — OP-IDN-058, OP-IDN-059, OP-IDN-060, OP-IDN-061 and OP-IDN-062
-- (HU-SP-025 criterion 4, HU-STUDIO-052 criteria 2-4).
--
-- A body photo is hers, and a gym sees only the ones she shows it:
--
--   · She shows a photo to one of her live relationships and stops showing it whenever,
--     even after the relationship ended; showing what is shown converges.
--   · The attending coach lists only what she showed his relationship, under a body grant
--     whose version includes photos; never her gallery, never what she showed another gym.
--   · Opening one is rechecked and recorded every time, and anything short of a shown photo
--     is not found. Only the API learns where it is kept.
--   · Outside that one review nobody but her sees a photo, not even the database's functions.
begin;

select plan(46);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f4a00-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f4a00-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f4a00-0000-7000-8000-000000000003', 'Dora', 'Client', 'active'),
  ('019f4a00-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019f4a00-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019f4a00-0000-7000-8000-000000000015', 'Fabio', 'Unassigned', 'active'),
  ('019f4a00-0000-7000-8000-000000000021', 'Oscar', 'Owner', 'active'),
  ('019f4a00-0000-7000-8000-000000000022', 'Hugo', 'Coach', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f4a00-0000-7000-8000-000000000101', 'gym', 'Gym A',
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}'),
  ('019f4a00-0000-7000-8000-000000000102', 'gym', 'Gym B',
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}'),
  ('019f4a00-0000-7000-8000-000000000103', 'gym', 'Gym C',
   '{"party_kind":"legal_entity","party_name":"Gym C SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019f4a00-0000-7000-8000-000000000211', '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000011', 'active'),
  ('019f4a00-0000-7000-8000-000000000212', '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000012', 'active'),
  ('019f4a00-0000-7000-8000-000000000215', '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000015', 'active'),
  ('019f4a00-0000-7000-8000-000000000221', '019f4a00-0000-7000-8000-000000000102', '019f4a00-0000-7000-8000-000000000021', 'active'),
  ('019f4a00-0000-7000-8000-000000000222', '019f4a00-0000-7000-8000-000000000102', '019f4a00-0000-7000-8000-000000000022', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019f4a00-0000-7000-8000-000000000211', 'owner'),
  ('019f4a00-0000-7000-8000-000000000212', 'coach'),
  ('019f4a00-0000-7000-8000-000000000215', 'coach'),
  ('019f4a00-0000-7000-8000-000000000221', 'owner'),
  ('019f4a00-0000-7000-8000-000000000222', 'coach');

-- Ana is a client of Gyms A and B and left Gym C; Bruno and Dora are clients of Gym A.
insert into relationships.service_relationships (id, person_id, organization_id, status, started_at, ended_at, ended_reason)
values
  ('019f4a00-0000-7000-8000-000000000701', '019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '90 days', null, null),
  ('019f4a00-0000-7000-8000-000000000702', '019f4a00-0000-7000-8000-000000000002', '019f4a00-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '90 days', null, null),
  ('019f4a00-0000-7000-8000-000000000703', '019f4a00-0000-7000-8000-000000000003', '019f4a00-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '90 days', null, null),
  ('019f4a00-0000-7000-8000-000000000706', '019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000102', 'active', clock_timestamp() - interval '90 days', null, null),
  ('019f4a00-0000-7000-8000-000000000708', '019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000103', 'terminated', clock_timestamp() - interval '90 days', clock_timestamp() - interval '1 day', 'left');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
  kind, status, ends_on, accepted_by_person_at
) values
  ('019f4a00-0000-7000-8000-000000000801', '019f4a00-0000-7000-8000-000000000701', '019f4a00-0000-7000-8000-000000000001',
   '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f4a00-0000-7000-8000-000000000802', '019f4a00-0000-7000-8000-000000000702', '019f4a00-0000-7000-8000-000000000002',
   '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f4a00-0000-7000-8000-000000000803', '019f4a00-0000-7000-8000-000000000703', '019f4a00-0000-7000-8000-000000000003',
   '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000212', null, 'holder', 'active', null, null),
  ('019f4a00-0000-7000-8000-000000000807', '019f4a00-0000-7000-8000-000000000706', '019f4a00-0000-7000-8000-000000000001',
   '019f4a00-0000-7000-8000-000000000102', '019f4a00-0000-7000-8000-000000000222', null, 'holder', 'active', null, null);

-- Gym A was shared the body version with photos; Gym B an earlier one without them. Bruno
-- shares a version with the day of a photo but not the photo, Dora one with neither day.
insert into privacy.scope_definitions (id, scope_code, version_number, status)
values
  ('019f4a00-0000-7000-8000-000000000311', 'body_progress', 3, 'draft'),
  ('019f4a00-0000-7000-8000-000000000312', 'body_progress', 1, 'draft'),
  ('019f4a00-0000-7000-8000-000000000313', 'body_progress', 4, 'draft'),
  ('019f4a00-0000-7000-8000-000000000314', 'body_progress', 5, 'draft');
insert into privacy.scope_resource_rules (scope_definition_id, resource, field, data_classification_code, max_action, is_excluded)
values
  ('019f4a00-0000-7000-8000-000000000311', 'identity.body_progress_records', 'metric_code', 'body', 'read', false),
  ('019f4a00-0000-7000-8000-000000000311', 'identity.body_photos', 'taken_on', 'body', 'read', false),
  ('019f4a00-0000-7000-8000-000000000311', 'identity.body_photos', 'media_ref', 'body', 'read', false),
  ('019f4a00-0000-7000-8000-000000000312', 'identity.body_progress_records', 'metric_code', 'body', 'read', false),
  ('019f4a00-0000-7000-8000-000000000312', 'identity.body_photos', '*', 'body', 'read', true),
  ('019f4a00-0000-7000-8000-000000000313', 'identity.body_photos', 'taken_on', 'body', 'read', false),
  ('019f4a00-0000-7000-8000-000000000314', 'identity.body_photos', 'media_ref', 'body', 'read', false);
update privacy.scope_definitions set status = 'published', published_at = clock_timestamp()
where id in ('019f4a00-0000-7000-8000-000000000311', '019f4a00-0000-7000-8000-000000000312', '019f4a00-0000-7000-8000-000000000313', '019f4a00-0000-7000-8000-000000000314');

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values
  ('019f4a00-0000-7000-8000-000000000401', '019f4a00-0000-7000-8000-000000000101',
   '019f4a00-0000-7000-8000-000000000211', 'email', 'ana-a@example.test',
   extensions.digest('photo-token-a', 'sha256'), 1, extensions.digest('photo-proposal-a', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
   'completed', clock_timestamp() + interval '7 days'),
  ('019f4a00-0000-7000-8000-000000000402', '019f4a00-0000-7000-8000-000000000102',
   '019f4a00-0000-7000-8000-000000000221', 'email', 'ana-b@example.test',
   extensions.digest('photo-token-b', 'sha256'), 1, extensions.digest('photo-proposal-b', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}',
   'completed', clock_timestamp() + interval '7 days'),
  ('019f4a00-0000-7000-8000-000000000403', '019f4a00-0000-7000-8000-000000000101',
   '019f4a00-0000-7000-8000-000000000211', 'email', 'bruno@example.test',
   extensions.digest('photo-token-c', 'sha256'), 1, extensions.digest('photo-proposal-c', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
   'completed', clock_timestamp() + interval '7 days'),
  ('019f4a00-0000-7000-8000-000000000404', '019f4a00-0000-7000-8000-000000000101',
   '019f4a00-0000-7000-8000-000000000211', 'email', 'dora@example.test',
   extensions.digest('photo-token-d', 'sha256'), 1, extensions.digest('photo-proposal-d', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
   'completed', clock_timestamp() + interval '7 days');
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values
  ('019f4a00-0000-7000-8000-000000000501', '019f4a00-0000-7000-8000-000000000401', 'service_relationship', 'pending', null),
  ('019f4a00-0000-7000-8000-000000000502', '019f4a00-0000-7000-8000-000000000402', 'service_relationship', 'pending', null),
  ('019f4a00-0000-7000-8000-000000000503', '019f4a00-0000-7000-8000-000000000403', 'service_relationship', 'pending', null),
  ('019f4a00-0000-7000-8000-000000000504', '019f4a00-0000-7000-8000-000000000404', 'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values
  ('019f4a00-0000-7000-8000-000000000611', '019f4a00-0000-7000-8000-000000000501', '019f4a00-0000-7000-8000-000000000311',
   'body_progress', 'read', 'Follow the body', '{"title":"Body"}'::jsonb, 'accepted', clock_timestamp()),
  ('019f4a00-0000-7000-8000-000000000612', '019f4a00-0000-7000-8000-000000000502', '019f4a00-0000-7000-8000-000000000312',
   'body_progress', 'read', 'Follow the body', '{"title":"Body"}'::jsonb, 'accepted', clock_timestamp()),
  ('019f4a00-0000-7000-8000-000000000613', '019f4a00-0000-7000-8000-000000000503', '019f4a00-0000-7000-8000-000000000313',
   'body_progress', 'read', 'Follow the body', '{"title":"Body"}'::jsonb, 'accepted', clock_timestamp()),
  ('019f4a00-0000-7000-8000-000000000614', '019f4a00-0000-7000-8000-000000000504', '019f4a00-0000-7000-8000-000000000314',
   'body_progress', 'read', 'Follow the body', '{"title":"Body"}'::jsonb, 'accepted', clock_timestamp());

create function pg_temp.share(relationship uuid, grant_id uuid, chosen uuid)
returns void language plpgsql as $$
declare
  subject record;
  offered record;
begin
  select person_id, organization_id into subject
  from relationships.service_relationships where id = relationship;
  select id, scope_definition_id, scope_code into offered
  from privacy.invitation_scope_options where id = chosen;
  insert into privacy.consent_events (
    id, person_id, relationship_id, organization_id, invitation_scope_option_id,
    scope_definition_id, scope_code, decision, presented_snapshot
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id, offered.id,
    offered.scope_definition_id, offered.scope_code, 'accepted', '{"title":"Shared"}'::jsonb
  );
  insert into privacy.data_grants (
    id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
    consent_event_id, access_level, purpose
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id,
    offered.scope_definition_id, offered.scope_code, grant_id, 'read', 'Follow the body'
  );
end
$$;

select pg_temp.share('019f4a00-0000-7000-8000-000000000701', '019f4a00-0000-7000-8000-000000000a11', '019f4a00-0000-7000-8000-000000000611');
select pg_temp.share('019f4a00-0000-7000-8000-000000000706', '019f4a00-0000-7000-8000-000000000a12', '019f4a00-0000-7000-8000-000000000612');
select pg_temp.share('019f4a00-0000-7000-8000-000000000702', '019f4a00-0000-7000-8000-000000000a13', '019f4a00-0000-7000-8000-000000000613');
select pg_temp.share('019f4a00-0000-7000-8000-000000000703', '019f4a00-0000-7000-8000-000000000a14', '019f4a00-0000-7000-8000-000000000614');

-- Her photos: two she will show, one that stays in her gallery; and one of Bruno's.
insert into identity.body_photos (id, person_id, taken_on, media_ref)
values
  ('019f4a00-0000-7000-8000-000000000e01', '019f4a00-0000-7000-8000-000000000001', current_date - 3, 'body/019f4a00-0000-7000-8000-000000000001/e01.jpg'),
  ('019f4a00-0000-7000-8000-000000000e02', '019f4a00-0000-7000-8000-000000000001', current_date - 2, 'body/019f4a00-0000-7000-8000-000000000001/e02.jpg'),
  ('019f4a00-0000-7000-8000-000000000e03', '019f4a00-0000-7000-8000-000000000001', current_date - 1, 'body/019f4a00-0000-7000-8000-000000000001/e03.jpg'),
  ('019f4a00-0000-7000-8000-000000000e09', '019f4a00-0000-7000-8000-000000000002', current_date - 1, 'body/019f4a00-0000-7000-8000-000000000002/e09.jpg'),
  ('019f4a00-0000-7000-8000-000000000e05', '019f4a00-0000-7000-8000-000000000003', current_date - 1, 'body/019f4a00-0000-7000-8000-000000000003/e05.jpg');

-- Bruno and Dora each show their one photo to Gym A.
insert into identity.body_photo_shares (person_id, body_photo_id, relationship_id)
values
  ('019f4a00-0000-7000-8000-000000000002', '019f4a00-0000-7000-8000-000000000e09', '019f4a00-0000-7000-8000-000000000702'),
  ('019f4a00-0000-7000-8000-000000000003', '019f4a00-0000-7000-8000-000000000e05', '019f4a00-0000-7000-8000-000000000703');

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.purpose', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_token', '', true);
  perform set_config('app.request_id', gen_random_uuid()::text, true);
end
$$;

create function pg_temp.sqlstate(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'no error';
exception when others then
  return sqlstate;
end
$$;

create function pg_temp.shown(document jsonb) returns uuid[] language sql as $$
  select coalesce(array_agg((element ->> 'id')::uuid order by position), '{}')
  from jsonb_array_elements(document -> 'items') with ordinality as listed (element, position)
$$;

create function pg_temp.share_photo(photo uuid, relationship uuid, key uuid, command uuid, hash text)
returns table (result jsonb, replayed boolean) language sql as $$
  select * from identity.share_body_photo('019f4a00-0000-7000-8000-000000000001', photo, relationship,
    key, command, decode(hash, 'hex'))
$$;

create function pg_temp.events(kind text, photo uuid) returns integer language sql as $$
  select count(*)::integer from system.outbox_events
  where event_type = kind and payload ->> 'body_photo_id' = photo::text
$$;

-- ---------------------------------------------------------------------------
-- OP-IDN-061: she shows a photo to one gym
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f4a00-0000-7000-8000-000000000001');
select result as first_share, replayed as first_replayed from pg_temp.share_photo(
  '019f4a00-0000-7000-8000-000000000e01', '019f4a00-0000-7000-8000-000000000701',
  '7c000000-0000-4000-8000-000000000001', '019f4a00-0000-7000-8000-000000000f01', repeat('01', 32)) \gset
reset role;

select results_eq(
  format($sql$select %L::jsonb ->> 'status', %L::jsonb -> 'organization' ->> 'display_name', %L::boolean$sql$,
         :'first_share', :'first_share', :'first_replayed'),
  $$values ('shared', 'Gym A', false)$$,
  'T-IDN-PHOTO-SHARE-IDEM-01 she shows a photo to Gym A');

set local role allfit_api;
select pg_temp.act('019f4a00-0000-7000-8000-000000000001');
select is(
  (select replayed from pg_temp.share_photo('019f4a00-0000-7000-8000-000000000e01', '019f4a00-0000-7000-8000-000000000701',
    '7c000000-0000-4000-8000-000000000001', '019f4a00-0000-7000-8000-000000000f01', repeat('01', 32))),
  true,
  'T-IDN-PHOTO-SHARE-IDEM-02 the same command again is a replay');
select is(
  (select replayed from pg_temp.share_photo('019f4a00-0000-7000-8000-000000000e01', '019f4a00-0000-7000-8000-000000000701',
    '7c000000-0000-4000-8000-000000000002', '019f4a00-0000-7000-8000-000000000f02', repeat('02', 32))),
  false,
  'T-IDN-PHOTO-SHARE-IDEM-03 a new command to show what is shown converges');
select is(
  pg_temp.sqlstate($$select * from pg_temp.share_photo('019f4a00-0000-7000-8000-000000000e02', '019f4a00-0000-7000-8000-000000000701',
    '7c000000-0000-4000-8000-000000000001', '019f4a00-0000-7000-8000-000000000f03', repeat('03', 32))$$),
  '23505',
  'T-IDN-PHOTO-SHARE-IDEM-04 a key reused for another request is refused');
reset role;
select is(
  pg_temp.events('identity.body_photo_shared.v1', '019f4a00-0000-7000-8000-000000000e01'),
  1,
  'T-IDN-PHOTO-SHARE-INT-01 and only the change is announced');

set local role allfit_api;
select pg_temp.act('019f4a00-0000-7000-8000-000000000001');
select is(
  pg_temp.sqlstate($$select * from pg_temp.share_photo('019f4a00-0000-7000-8000-000000000e09', '019f4a00-0000-7000-8000-000000000701',
    '7c000000-0000-4000-8000-000000000004', '019f4a00-0000-7000-8000-000000000f04', repeat('04', 32))$$),
  'P0002',
  'T-IDN-PHOTO-SHARE-RLS-01 she cannot show someone else''s photo');
select is(
  pg_temp.sqlstate($$select * from pg_temp.share_photo('019f4a00-0000-7000-8000-000000000e01', '019f4a00-0000-7000-8000-000000000702',
    '7c000000-0000-4000-8000-000000000005', '019f4a00-0000-7000-8000-000000000f05', repeat('05', 32))$$),
  'P0002',
  'T-IDN-PHOTO-SHARE-RLS-02 nor show hers through someone else''s relationship');
select is(
  pg_temp.sqlstate($$select * from pg_temp.share_photo('019f4a00-0000-7000-8000-000000000e01', '019f4a00-0000-7000-8000-000000000708',
    '7c000000-0000-4000-8000-000000000006', '019f4a00-0000-7000-8000-000000000f06', repeat('06', 32))$$),
  '55000',
  'T-IDN-PHOTO-SHARE-INT-02 a photo is shown only to a live relationship');
select pg_temp.act('019f4a00-0000-7000-8000-000000000002');
select is(
  pg_temp.sqlstate($$select * from pg_temp.share_photo('019f4a00-0000-7000-8000-000000000e01', '019f4a00-0000-7000-8000-000000000701',
    '7c000000-0000-4000-8000-000000000007', '019f4a00-0000-7000-8000-000000000f07', repeat('07', 32))$$),
  '42501',
  'T-IDN-PHOTO-SHARE-RLS-03 nobody shows a photo on her behalf');

select pg_temp.act('019f4a00-0000-7000-8000-000000000001');
select * from pg_temp.share_photo('019f4a00-0000-7000-8000-000000000e02', '019f4a00-0000-7000-8000-000000000701',
  '7c000000-0000-4000-8000-000000000008', '019f4a00-0000-7000-8000-000000000f08', repeat('08', 32));
select * from pg_temp.share_photo('019f4a00-0000-7000-8000-000000000e01', '019f4a00-0000-7000-8000-000000000706',
  '7c000000-0000-4000-8000-000000000009', '019f4a00-0000-7000-8000-000000000f09', repeat('09', 32));
select identity.list_my_body_photos('019f4a00-0000-7000-8000-000000000001') as mine \gset
reset role;

select results_eq(
  format($sql$select element ->> 'id', (select coalesce(array_agg(shared ->> 'organization_name' order by shared ->> 'organization_name'), '{}')
                                             from jsonb_array_elements(element -> 'shared_with') as shared)
              from jsonb_array_elements(%L::jsonb) as element order by element ->> 'id'$sql$, :'mine'),
  $$values ('019f4a00-0000-7000-8000-000000000e01', array['Gym A', 'Gym B']),
           ('019f4a00-0000-7000-8000-000000000e02', array['Gym A']),
           ('019f4a00-0000-7000-8000-000000000e03', '{}'::text[])$$,
  'T-IDN-PHOTO-SHARE-API-01 her own list says whom she shows each photo to');

-- ---------------------------------------------------------------------------
-- OP-IDN-059 and OP-IDN-060: what the attending coach sees
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f4a00-0000-7000-8000-000000000012');
select current_setting('app.request_id') as camilo_list \gset
select identity.list_client_shared_body_photos('019f4a00-0000-7000-8000-000000000012',
  '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000001', 20, null, null) as list_a \gset
select current_setting('app.contract_scope_purpose', true) as purpose_after_list \gset
select pg_temp.act('019f4a00-0000-7000-8000-000000000022');
select identity.list_client_shared_body_photos('019f4a00-0000-7000-8000-000000000022',
  '019f4a00-0000-7000-8000-000000000102', '019f4a00-0000-7000-8000-000000000001', 20, null, null) as list_b \gset
reset role;

select is(
  pg_temp.shown(:'list_a'::jsonb),
  array['019f4a00-0000-7000-8000-000000000e02', '019f4a00-0000-7000-8000-000000000e01']::uuid[],
  'T-IDN-PHOTO-SHARE-API-02 the coach sees what she showed his gym, newest first, and not her gallery');
select is(
  (select array_agg(key order by key) from jsonb_array_elements(:'list_a'::jsonb -> 'items') as element,
     jsonb_object_keys(element) as key where element ->> 'id' = '019f4a00-0000-7000-8000-000000000e01'),
  array['id', 'shared_at', 'taken_on'],
  'T-IDN-PHOTO-SHARE-API-03 each photo is a day and when she showed it, never where it is kept');
select results_eq(
  format($sql$select data_grant_id, scope_code, scope_version, resource, result, purpose
              from privacy.access_events where request_id = %L$sql$, :'camilo_list'),
  $$values ('019f4a00-0000-7000-8000-000000000a11'::uuid, 'body_progress', 3, 'identity.body_photos', 'allowed', 'studio_body_review')$$,
  'T-IDN-PHOTO-SHARE-API-04 the list is recorded under the body grant and its version');
select is(
  coalesce(nullif(:'purpose_after_list', ''), 'closed'),
  'closed',
  'T-IDN-PHOTO-SHARE-RLS-04 the review closes when the list is done');
select is(
  pg_temp.shown(:'list_b'::jsonb),
  '{}'::uuid[],
  'T-IDN-PHOTO-SHARE-API-05 Gym B''s version does not include photos, so what she showed it is not listed');

set local role allfit_api;
select pg_temp.act('019f4a00-0000-7000-8000-000000000012');
select current_setting('app.request_id') as camilo_open \gset
select is(
  identity.open_client_shared_body_photo('019f4a00-0000-7000-8000-000000000012',
    '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000e01'),
  '{"outcome": "found", "media_ref": "body/019f4a00-0000-7000-8000-000000000001/e01.jpg"}'::jsonb,
  'T-IDN-PHOTO-SHARE-API-06 opening a shown photo tells the API where it is kept');
select current_setting('app.contract_scope_purpose', true) as purpose_after_open \gset
select identity.open_client_shared_body_photo('019f4a00-0000-7000-8000-000000000012',
  '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000e01');
select is(
  identity.open_client_shared_body_photo('019f4a00-0000-7000-8000-000000000012',
    '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000e03'),
  '{"outcome": "not_found"}'::jsonb,
  'T-IDN-PHOTO-SHARE-API-07 a photo she keeps in her gallery is not found');
select is(
  identity.open_client_shared_body_photo('019f4a00-0000-7000-8000-000000000012',
    '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000e09'),
  '{"outcome": "not_found"}'::jsonb,
  'T-IDN-PHOTO-SHARE-API-08 nor is someone else''s photo opened through her');
select pg_temp.act('019f4a00-0000-7000-8000-000000000022');
select is(
  identity.open_client_shared_body_photo('019f4a00-0000-7000-8000-000000000022',
    '019f4a00-0000-7000-8000-000000000102', '019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000e01'),
  '{"outcome": "not_found"}'::jsonb,
  'T-IDN-PHOTO-SHARE-API-09 nor one shown to a gym whose version leaves photos out');
select pg_temp.act('019f4a00-0000-7000-8000-000000000015');
select is(
  pg_temp.sqlstate($$select identity.open_client_shared_body_photo('019f4a00-0000-7000-8000-000000000015',
    '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000e01')$$),
  'P0002',
  'T-IDN-PHOTO-SHARE-API-10 a coach who does not attend her finds no client');
reset role;

select is(
  coalesce(nullif(:'purpose_after_open', ''), 'closed'),
  'closed',
  'T-IDN-PHOTO-SHARE-RLS-05 the review closes when the photo is opened');
select results_eq(
  format($sql$select count(*) filter (where result = 'allowed')::integer, count(*) filter (where result = 'denied')::integer
              from privacy.access_events where actor_person_id = '019f4a00-0000-7000-8000-000000000012'
                and resource = 'identity.body_photos' and request_id = %L$sql$, :'camilo_open'),
  $$values (2, 2)$$,
  'T-IDN-PHOTO-SHARE-API-11 every opening is recorded, allowed or not');

-- ---------------------------------------------------------------------------
-- Outside the review nobody but her sees a photo
-- ---------------------------------------------------------------------------
create function pg_temp.visible(actor uuid, membership uuid, purpose text, scope uuid, signed boolean)
returns integer language plpgsql as $$
declare
  seen integer;
begin
  perform pg_temp.act(actor);
  perform set_config('app.actor_org_id', '019f4a00-0000-7000-8000-000000000101', true);
  perform set_config('app.actor_membership_id', coalesce(membership::text, ''), true);
  if signed then
    perform access_control.open_contract_scope(purpose, scope);
  elsif scope is not null then
    perform set_config('app.contract_scope_purpose', purpose, true);
    perform set_config('app.contract_scope_id', scope::text, true);
  end if;
  select count(*)::integer into seen from identity.body_photos
  where person_id = '019f4a00-0000-7000-8000-000000000001';
  return seen;
end
$$;

set local role allfit_owner;
select is(
  pg_temp.visible('019f4a00-0000-7000-8000-000000000012', '019f4a00-0000-7000-8000-000000000212', null, null, false),
  0,
  'T-IDN-PHOTO-SHARE-RLS-06 outside a review her coach sees none of her photos');
select is(
  pg_temp.visible('019f4a00-0000-7000-8000-000000000012', '019f4a00-0000-7000-8000-000000000212',
    'body_photo_review', '019f4a00-0000-7000-8000-000000000701', true),
  2,
  'T-IDN-PHOTO-SHARE-RLS-07 inside the review of his relationship he sees the two she showed it');
select is(
  pg_temp.visible('019f4a00-0000-7000-8000-000000000012', '019f4a00-0000-7000-8000-000000000212',
    'body_photo_review', '019f4a00-0000-7000-8000-000000000701', false),
  0,
  'T-IDN-PHOTO-SHARE-RLS-08 a review nobody signed opens nothing');
select is(
  pg_temp.visible('019f4a00-0000-7000-8000-000000000012', '019f4a00-0000-7000-8000-000000000212',
    'session_screening', '019f4a00-0000-7000-8000-000000000701', true),
  0,
  'T-IDN-PHOTO-SHARE-RLS-09 nor does a contract scope opened for something else');
select is(
  pg_temp.visible('019f4a00-0000-7000-8000-000000000012', '019f4a00-0000-7000-8000-000000000212',
    'body_photo_review', '019f4a00-0000-7000-8000-000000000706', true),
  0,
  'T-IDN-PHOTO-SHARE-RLS-10 nor the review of a relationship he does not attend');
select is(
  pg_temp.visible('019f4a00-0000-7000-8000-000000000001', null, null, null, false),
  3,
  'T-IDN-PHOTO-SHARE-RLS-11 she still sees all of hers');
reset role;

-- A version shares a photo only with its day and its image: one without either lists none.
set local role allfit_api;
select pg_temp.act('019f4a00-0000-7000-8000-000000000012');
select is(
  pg_temp.shown(identity.list_client_shared_body_photos('019f4a00-0000-7000-8000-000000000012',
    '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000002', 20, null, null)),
  '{}'::uuid[],
  'T-IDN-PHOTO-SHARE-API-16 a version with the day but not the image lists no photo');
select is(
  identity.open_client_shared_body_photo('019f4a00-0000-7000-8000-000000000012',
    '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000002', '019f4a00-0000-7000-8000-000000000e09'),
  '{"outcome": "not_found"}'::jsonb,
  'T-IDN-PHOTO-SHARE-API-17 nor opens one');
select is(
  pg_temp.shown(identity.list_client_shared_body_photos('019f4a00-0000-7000-8000-000000000012',
    '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000003', 20, null, null)),
  '{}'::uuid[],
  'T-IDN-PHOTO-SHARE-API-18 a version with the image but not the day lists no photo');
select is(
  identity.open_client_shared_body_photo('019f4a00-0000-7000-8000-000000000012',
    '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000003', '019f4a00-0000-7000-8000-000000000e05'),
  '{"outcome": "not_found"}'::jsonb,
  'T-IDN-PHOTO-SHARE-API-19 nor opens one, so nothing opens that the list would not show');
reset role;

-- ---------------------------------------------------------------------------
-- OP-IDN-062: she stops showing it
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f4a00-0000-7000-8000-000000000001');
select is(
  (select result ->> 'status' from identity.withdraw_body_photo_share('019f4a00-0000-7000-8000-000000000001',
    '019f4a00-0000-7000-8000-000000000e02', '019f4a00-0000-7000-8000-000000000701',
    '7c000000-0000-4000-8000-000000000010', '019f4a00-0000-7000-8000-000000000f10', decode(repeat('10', 32), 'hex'))),
  'withdrawn',
  'T-IDN-PHOTO-SHARE-IDEM-05 she stops showing a photo to Gym A');
select pg_temp.act('019f4a00-0000-7000-8000-000000000012');
select is(
  pg_temp.shown(identity.list_client_shared_body_photos('019f4a00-0000-7000-8000-000000000012',
    '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000001', 20, null, null)),
  array['019f4a00-0000-7000-8000-000000000e01']::uuid[],
  'T-IDN-PHOTO-SHARE-API-12 and the coach stops seeing it at once');
select pg_temp.act('019f4a00-0000-7000-8000-000000000001');
select is(
  (select element -> 'shared_with' from jsonb_array_elements(identity.list_my_body_photos('019f4a00-0000-7000-8000-000000000001')) as element
   where element ->> 'id' = '019f4a00-0000-7000-8000-000000000e02'),
  '[]'::jsonb,
  'T-IDN-PHOTO-SHARE-API-15 and her own list no longer names that gym');
reset role;
set local role allfit_owner;
select is(
  pg_temp.visible('019f4a00-0000-7000-8000-000000000012', '019f4a00-0000-7000-8000-000000000212',
    'body_photo_review', '019f4a00-0000-7000-8000-000000000701', true),
  1,
  'T-IDN-PHOTO-SHARE-RLS-12 nor does the review open the photo she took back');
reset role;
set local role allfit_api;
select pg_temp.act('019f4a00-0000-7000-8000-000000000001');
select is(
  pg_temp.sqlstate($$select * from identity.withdraw_body_photo_share('019f4a00-0000-7000-8000-000000000001',
    '019f4a00-0000-7000-8000-000000000e03', '019f4a00-0000-7000-8000-000000000701',
    '7c000000-0000-4000-8000-000000000011', '019f4a00-0000-7000-8000-000000000f11', decode(repeat('11', 32), 'hex'))$$),
  'P0002',
  'T-IDN-PHOTO-SHARE-INT-03 there is nothing to withdraw from a photo she never showed');
reset role;

-- She showed one to Gym C before she left it; she can still take it back.
insert into identity.body_photo_shares (person_id, body_photo_id, relationship_id)
values ('019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000e03', '019f4a00-0000-7000-8000-000000000708');
set local role allfit_api;
select pg_temp.act('019f4a00-0000-7000-8000-000000000001');
select is(
  (select result ->> 'status' from identity.withdraw_body_photo_share('019f4a00-0000-7000-8000-000000000001',
    '019f4a00-0000-7000-8000-000000000e03', '019f4a00-0000-7000-8000-000000000708',
    '7c000000-0000-4000-8000-000000000012', '019f4a00-0000-7000-8000-000000000f12', decode(repeat('12', 32), 'hex'))),
  'withdrawn',
  'T-IDN-PHOTO-SHARE-INT-04 withdrawing works after the relationship ended');
select results_eq(
  $$select result ->> 'status', replayed from identity.withdraw_body_photo_share('019f4a00-0000-7000-8000-000000000001',
    '019f4a00-0000-7000-8000-000000000e03', '019f4a00-0000-7000-8000-000000000708',
    '7c000000-0000-4000-8000-000000000015', '019f4a00-0000-7000-8000-000000000f15', decode(repeat('15', 32), 'hex'))$$,
  $$values ('withdrawn', false)$$,
  'T-IDN-PHOTO-SHARE-IDEM-07 a new command to take back what is taken back converges');
select is(
  (select result ->> 'status' from pg_temp.share_photo('019f4a00-0000-7000-8000-000000000e02', '019f4a00-0000-7000-8000-000000000701',
    '7c000000-0000-4000-8000-000000000013', '019f4a00-0000-7000-8000-000000000f13', repeat('13', 32))),
  'shared',
  'T-IDN-PHOTO-SHARE-IDEM-06 and she can show a photo again');
reset role;
select results_eq(
  $$select pg_temp.events('identity.body_photo_shared.v1', '019f4a00-0000-7000-8000-000000000e02'),
           pg_temp.events('identity.body_photo_share_withdrawn.v1', '019f4a00-0000-7000-8000-000000000e02'),
           pg_temp.events('identity.body_photo_share_withdrawn.v1', '019f4a00-0000-7000-8000-000000000e03')$$,
  $$values (2, 1, 1)$$,
  'T-IDN-PHOTO-SHARE-INT-05 every change is announced once');

-- ---------------------------------------------------------------------------
-- Revoking and deleting
-- ---------------------------------------------------------------------------
update privacy.data_grants set status = 'revoked', revoked_at = clock_timestamp()
where id = '019f4a00-0000-7000-8000-000000000a11';
set local role allfit_api;
select pg_temp.act('019f4a00-0000-7000-8000-000000000012');
select is(
  identity.list_client_shared_body_photos('019f4a00-0000-7000-8000-000000000012',
    '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000001', 20, null, null),
  '{"outcome": "scope_required", "scope": "body_progress"}'::jsonb,
  'T-IDN-PHOTO-SHARE-API-13 once she revokes her body, the list names the category it needs');
select is(
  identity.open_client_shared_body_photo('019f4a00-0000-7000-8000-000000000012',
    '019f4a00-0000-7000-8000-000000000101', '019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000e01'),
  '{"outcome": "not_found"}'::jsonb,
  'T-IDN-PHOTO-SHARE-API-14 and a photo he already had a link to is not found any more');

select pg_temp.act('019f4a00-0000-7000-8000-000000000001');
select identity.delete_my_body_photo('019f4a00-0000-7000-8000-000000000001', '019f4a00-0000-7000-8000-000000000e01',
  '7c000000-0000-4000-8000-000000000014', '019f4a00-0000-7000-8000-000000000f14', decode(repeat('14', 32), 'hex'));
reset role;
select is(
  (select count(*)::integer from identity.body_photo_shares where body_photo_id = '019f4a00-0000-7000-8000-000000000e01'),
  0,
  'T-IDN-PHOTO-SHARE-INT-06 deleting a photo takes whom she showed it to with it');

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
select results_eq(
  $$select has_function_privilege('allfit_api', 'identity.share_body_photo(uuid, uuid, uuid, uuid, uuid, bytea)', 'execute'),
           has_function_privilege('allfit_api', 'identity.withdraw_body_photo_share(uuid, uuid, uuid, uuid, uuid, bytea)', 'execute'),
           has_function_privilege('allfit_api', 'identity.list_client_shared_body_photos(uuid, uuid, uuid, integer, date, uuid)', 'execute'),
           has_function_privilege('allfit_api', 'identity.open_client_shared_body_photo(uuid, uuid, uuid, uuid)', 'execute')$$,
  $$values (true, true, true, true)$$,
  'T-IDN-PHOTO-SHARE-PRIV-01 the runtime calls the four commands and reads');
select results_eq(
  $$select has_function_privilege('allfit_api', 'identity.body_photo_share_document(uuid, uuid)', 'execute'),
           has_table_privilege('allfit_api', 'identity.body_photo_shares', 'select'),
           has_table_privilege('allfit_api', 'identity.body_photos', 'select')$$,
  $$values (false, false, false)$$,
  'T-IDN-PHOTO-SHARE-PRIV-02 and never touches the tables');

select * from finish();
rollback;
