-- T-REL-DIRECTORY-03 — OP-REL-010, finding a client by name (HU-STUDIO-082).
--
-- The search narrows the same directory, never a wider one: a coach still finds
-- only the clients assigned to them. It ignores accents and case, treats `%` and
-- `_` as characters, matches names only (an invitation has none), and writes no
-- access event, because the directory carries identity and link state only.

begin;

select plan(19);

insert into identity.people (id, given_name, family_name, status)
values
  ('019ae100-0000-7000-8000-000000000001', 'José', 'Pérez', 'active'),
  ('019ae100-0000-7000-8000-000000000002', 'Álvaro', 'Gómez', 'active'),
  ('019ae100-0000-7000-8000-000000000003', 'João', 'Silva', 'active'),
  ('019ae100-0000-7000-8000-000000000004', 'Ana_Lu', 'Paz', 'active'),
  ('019ae100-0000-7000-8000-000000000005', 'Anael', 'Ruiz', 'active'),
  ('019ae100-0000-7000-8000-000000000011', 'Olivia', 'Owner', 'active'),
  ('019ae100-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active'),
  ('019ae100-0000-7000-8000-000000000013', 'Diana', 'Coach', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values (
  '019ae100-0000-7000-8000-000000000101', 'gym', 'Search Gym',
  '{"party_kind":"legal_entity","party_name":"Search SAS","purpose":"studio_operations"}'
);

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019ae100-0000-7000-8000-000000000201', '019ae100-0000-7000-8000-000000000101',
    '019ae100-0000-7000-8000-000000000011', 'active'),
  ('019ae100-0000-7000-8000-000000000202', '019ae100-0000-7000-8000-000000000101',
    '019ae100-0000-7000-8000-000000000012', 'active'),
  ('019ae100-0000-7000-8000-000000000203', '019ae100-0000-7000-8000-000000000101',
    '019ae100-0000-7000-8000-000000000013', 'active');

insert into organizations.membership_roles (membership_id, role_code)
values
  ('019ae100-0000-7000-8000-000000000201', 'owner'),
  ('019ae100-0000-7000-8000-000000000202', 'coach'),
  ('019ae100-0000-7000-8000-000000000203', 'coach');

insert into relationships.service_relationships (
  id, person_id, organization_id, status, started_at, ended_at
) values
  ('019ae100-0000-7000-8000-000000000301', '019ae100-0000-7000-8000-000000000001',
    '019ae100-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days', null),
  ('019ae100-0000-7000-8000-000000000302', '019ae100-0000-7000-8000-000000000002',
    '019ae100-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days', null),
  ('019ae100-0000-7000-8000-000000000303', '019ae100-0000-7000-8000-000000000003',
    '019ae100-0000-7000-8000-000000000101', 'terminated', clock_timestamp() - interval '60 days',
    clock_timestamp() - interval '5 days'),
  ('019ae100-0000-7000-8000-000000000304', '019ae100-0000-7000-8000-000000000004',
    '019ae100-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days', null),
  ('019ae100-0000-7000-8000-000000000305', '019ae100-0000-7000-8000-000000000005',
    '019ae100-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '60 days', null);

-- Camilo attends José; Diana attends Álvaro.
insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id,
  kind, status, valid_from, ends_on, accepted_by_person_at
) values
  ('019ae100-0000-7000-8000-000000000401', '019ae100-0000-7000-8000-000000000301',
    '019ae100-0000-7000-8000-000000000001', '019ae100-0000-7000-8000-000000000101',
    '019ae100-0000-7000-8000-000000000202', 'holder', 'active',
    clock_timestamp() - interval '30 days', null, null),
  ('019ae100-0000-7000-8000-000000000402', '019ae100-0000-7000-8000-000000000302',
    '019ae100-0000-7000-8000-000000000002', '019ae100-0000-7000-8000-000000000101',
    '019ae100-0000-7000-8000-000000000203', 'holder', 'active',
    clock_timestamp() - interval '30 days', null, null);

-- Somebody invited whose address starts like a name: a search must not return it.
insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, expires_at
) values (
  '019ae100-0000-7000-8000-000000000501', '019ae100-0000-7000-8000-000000000101',
  '019ae100-0000-7000-8000-000000000201', 'email', 'jorge@example.test',
  extensions.digest('search-token-1', 'sha256'), 1,
  extensions.digest('search-proposal-1', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Search SAS","purpose":"studio_operations"}',
  clock_timestamp() + interval '7 days'
);

insert into identity.invitation_intents (id, invitation_id, kind, status)
values ('019ae100-0000-7000-8000-000000000601', '019ae100-0000-7000-8000-000000000501',
  'service_relationship', 'pending');

set local role allfit_owner;

select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019ae100-0000-7000-8000-000000000011', true);

select is(
  (select array_agg(display_name order by sort_group, sort_name)
     from relationships.list_organization_clients(
       '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
       null, 50, null, null, null, 'jose')),
  array['José Pérez'],
  'a search without accents finds the name written with them'
);

select is(
  (select array_agg(display_name)
     from relationships.list_organization_clients(
       '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
       null, 50, null, null, null, 'ALVARO')),
  array['Álvaro Gómez'],
  'case does not matter either, nor an accent on a capital letter'
);

select is(
  (select array_agg(display_name)
     from relationships.list_organization_clients(
       '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
       null, 50, null, null, null, 'PÉREZ')),
  array['José Pérez'],
  'an accent typed in the search folds the same way'
);

select is(
  (select array_agg(display_name)
     from relationships.list_organization_clients(
       '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
       null, 50, null, null, null, '  jose    perez ')),
  array['José Pérez'],
  'surrounding and repeated spaces are not part of what is searched'
);

select is(
  (select array_agg(display_name)
     from relationships.list_organization_clients(
       '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
       'terminated', 50, null, null, null, 'joao')),
  array['João Silva'],
  'the owner searches former clients when asking for terminated ones'
);

select is(
  (select array_agg(display_name)
     from relationships.list_organization_clients(
       '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
       null, 50, null, null, null, 'na_l')),
  array['Ana_Lu Paz'],
  'an underscore is a character, not a wildcard that also matches Anael'
);

select is(
  (select count(*) from relationships.list_organization_clients(
     '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
     null, 50, null, null, null, 'a%z')),
  0::bigint,
  'a percent sign is a character, not a wildcard that matches Álvaro Gómez'
);

select is(
  (select array_agg(entry_kind || ':' || display_name order by sort_group, sort_name)
     from relationships.list_organization_clients(
       '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
       null, 50, null, null, null, 'jo')),
  array['relationship:José Pérez', 'relationship:João Silva'],
  'a search returns people only: the invitation sent to jorge@ has no name to match'
);

select is(
  (select array_agg(display_name)
     from relationships.list_organization_clients(
       '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
       null, 1, 'active', 'José Pérez', '019ae100-0000-7000-8000-000000000301', 'jo')),
  array['João Silva'],
  'the next page of a search continues through the matches only'
);

select is(
  (select array_agg(sort_id order by sort_group, sort_name, sort_id)
     from relationships.list_organization_clients(
       '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
       null, 50, null, null, null)),
  (select array_agg(sort_id order by sort_group, sort_name, sort_id)
     from relationships.list_organization_clients(
       '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
       null, 50, null, null, null, null)),
  'the directory without a search is the same through either signature'
);

-- Camilo is a coach: the search narrows his directory, it does not widen it.
select set_config('app.actor_person_id', '019ae100-0000-7000-8000-000000000012', true);

select is(
  (select array_agg(display_name)
     from relationships.list_organization_clients(
       '019ae100-0000-7000-8000-000000000012', '019ae100-0000-7000-8000-000000000101',
       null, 50, null, null, null, 'jose')),
  array['José Pérez'],
  'a coach finds the client assigned to them'
);

select is(
  (select count(*) from relationships.list_organization_clients(
     '019ae100-0000-7000-8000-000000000012', '019ae100-0000-7000-8000-000000000101',
     null, 50, null, null, null, 'alvaro')),
  0::bigint,
  'and not a colleague''s client, even typing the exact name'
);

select set_config('app.actor_person_id', '019ae100-0000-7000-8000-000000000011', true);

select throws_ok(
  $$select * from relationships.list_organization_clients(
    '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
    null, 50, null, null, null, 'j')$$,
  '22023',
  'invalid directory search',
  'one character is not a search'
);

select throws_ok(
  format($$select * from relationships.list_organization_clients(
    '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
    null, 50, null, null, null, %L)$$, repeat('a', 81)),
  '22023',
  'invalid directory search',
  'nor are more than eighty'
);

select throws_ok(
  $$select * from relationships.list_organization_clients(
    '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
    null, 50, null, null, null, '    ')$$,
  '22023',
  'invalid directory search',
  'and blanks are not a search either'
);

select throws_ok(
  $$select * from relationships.list_organization_clients(
    '019ae100-0000-7000-8000-000000000011', '019ae100-0000-7000-8000-000000000101',
    'invited', 50, null, null, null, 'jorge')$$,
  '22023',
  'a name search does not match invitations',
  'searching the unanswered invitations is refused: none of them has a name'
);

select is(
  (select count(*) from privacy.access_events
    where subject_person_id in (
      '019ae100-0000-7000-8000-000000000001', '019ae100-0000-7000-8000-000000000002',
      '019ae100-0000-7000-8000-000000000003', '019ae100-0000-7000-8000-000000000004')),
  0::bigint,
  'searching writes no access event: it reads no fitness data'
);

select ok(
  has_function_privilege('allfit_api',
    'relationships.list_organization_clients(uuid, uuid, text, integer, text, text, uuid, text)',
    'execute')
  and has_function_privilege('allfit_api',
    'relationships.list_organization_clients(uuid, uuid, text, integer, text, text, uuid)',
    'execute'),
  'the API may call both signatures while it moves from one to the other'
);

select ok(
  not has_function_privilege('allfit_api', 'relationships.fold_name(text)', 'execute'),
  'the folding helper is not an entry point'
);

select * from finish();

rollback;
