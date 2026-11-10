-- T-IDN-OWN-PROFILE-01 — OP-IDN-012, OP-IDN-013, OP-IDN-063, OP-IDN-064 and OP-IDN-065
-- (`HU-SP-009`, `HU-SP-012` criterion 3, `HU-SP-013`, `HU-SP-023`, `HU-SP-096` criterion 4,
-- `HU-SP-098` criterion 6). TECH-43.
--
-- **A person reads everything about herself and corrects what she declared.** The profile
-- shows one version per attribute and says why that one: hers wins, otherwise the most
-- recent. The others are alternatives, never hidden and never deleted.
--
-- **Correcting after activation is not the onboarding again.** The name and the sex had
-- commands that belong to an open attempt; these belong to an active person.

begin;

select plan(57);

insert into identity.people (
  id, given_name, family_name, username, contact_email, contact_email_verified_at, contact_phone,
  status, activated_at, biological_sex
)
values
  ('019f4000-0000-7000-8000-000000000001', 'Camila', 'Rojas', 'camilarojas',
    'camila@example.test', '2026-07-03 10:00:00+00', '+573105550142', 'active', '2026-07-03 10:05:00+00', 'female'),
  ('019f4000-0000-7000-8000-000000000002', 'Other', 'Person', 'taken_handle',
    'other@example.test', null, null, 'active', '2026-07-04 10:00:00+00', null),
  ('019f4000-0000-7000-8000-000000000003', 'Pending', 'Person', 'pending_handle',
    'pending@example.test', null, null, 'pending_activation', null, null);

insert into identity.access_accounts (id, provider, issuer, subject, person_id, linked_at)
values
  ('019f4000-0000-7000-8000-000000000101', 'workos', 'https://issuer.test', 'own_profile',
    '019f4000-0000-7000-8000-000000000001', '2026-07-03 10:00:00+00'),
  ('019f4000-0000-7000-8000-000000000102', 'workos', 'https://issuer.test', 'other_profile',
    '019f4000-0000-7000-8000-000000000002', '2026-07-04 10:00:00+00'),
  ('019f4000-0000-7000-8000-000000000103', 'workos', 'https://issuer.test', 'pending_profile',
    '019f4000-0000-7000-8000-000000000003', '2026-07-05 10:00:00+00'),
  ('019f4000-0000-7000-8000-000000000104', 'workos', 'https://issuer.test', 'no_person', null,
    '2026-07-06 10:00:00+00');

create function pg_temp.profile(p_subject text) returns jsonb
language sql as $fn$
  select identity.read_own_profile('workos', 'https://issuer.test', p_subject)
$fn$;

create function pg_temp.attribute(p_subject text, p_code text) returns jsonb
language sql as $fn$
  select entry
  from jsonb_array_elements(pg_temp.profile(p_subject)->'attributes') as entry
  where entry->>'attribute_code' = p_code
$fn$;

create function pg_temp.claim(
  p_person uuid, p_code text, p_value text, p_provenance identity.provenance,
  p_from timestamptz, p_to timestamptz default null
) returns void
language sql as $fn$
  insert into identity.fitness_profile_claims (
    id, person_id, attribute_code, value_text, provenance, captured_by_kind, valid_from, valid_to
  ) values (
    extensions.uuid_generate_v7(), p_person, p_code, p_value, p_provenance,
    case when p_provenance = 'person_declared' then 'person'::identity.actor_kind
         else 'professional'::identity.actor_kind end,
    p_from, p_to
  )
$fn$;

-- ---------------------------------------------------------------------------
-- The four new members of the attribute catalogue
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select code, value_kind, data_classification_code, allowed_values
     from identity.profile_attributes
     where code in ('training_days_per_week', 'session_duration', 'training_place',
                    'available_equipment')
     order by code $$,
  $$ values
       ('available_equipment'::text, 'enum'::text, 'training'::text,
        array['bodyweight', 'dumbbell', 'kettlebell', 'barbell', 'bench', 'pull_up_bar', 'cable',
              'machine', 'cardio_machine']::text[]),
       ('session_duration', 'enum', 'training',
        array['up_to_30_min', '30_to_45_min', '45_to_60_min', 'over_60_min']::text[]),
       ('training_days_per_week', 'enum', 'training',
        array['1', '2', '3', '4', '5', '6', '7']::text[]),
       ('training_place', 'enum', 'training',
        array['gym', 'home', 'outdoors', 'multiple']::text[]) $$,
  'availability, place and equipment are training data with closed vocabularies'
);

-- ---------------------------------------------------------------------------
-- Reading my profile
-- ---------------------------------------------------------------------------

select is(
  pg_temp.profile('own_profile'),
  jsonb_build_object('biological_sex', 'female', 'attributes', '[]'::jsonb),
  'with nothing answered the profile holds the sex and no attribute, not empty ones'
);

-- Hers and a coach's coexist; another person's never reaches her.
select pg_temp.claim('019f4000-0000-7000-8000-000000000001', 'primary_training_goal',
  'lose_weight', 'person_declared', '2026-07-03 10:10:00+00', '2026-08-01 09:00:00+00');
select pg_temp.claim('019f4000-0000-7000-8000-000000000001', 'primary_training_goal',
  'build_muscle', 'person_declared', '2026-08-01 09:00:00+00');
select pg_temp.claim('019f4000-0000-7000-8000-000000000001', 'training_experience',
  'some_practice', 'person_declared', '2026-07-03 10:11:00+00');
select pg_temp.claim('019f4000-0000-7000-8000-000000000001', 'training_experience',
  'experienced', 'professional_observation', '2026-09-24 08:00:00+00');
select pg_temp.claim('019f4000-0000-7000-8000-000000000001', 'training_place',
  'gym', 'professional_observation', '2026-09-20 08:00:00+00');
select pg_temp.claim('019f4000-0000-7000-8000-000000000001', 'training_place',
  'home', 'professional_observation', '2026-09-25 08:00:00+00');
select pg_temp.claim('019f4000-0000-7000-8000-000000000001', 'focus_areas',
  'legs', 'person_declared', '2026-07-03 10:12:00+00');
select pg_temp.claim('019f4000-0000-7000-8000-000000000001', 'focus_areas',
  'back', 'person_declared', '2026-07-03 10:12:00+00');
select pg_temp.claim('019f4000-0000-7000-8000-000000000002', 'primary_training_goal',
  'maintain', 'person_declared', '2026-07-04 10:10:00+00');

select is(
  (select jsonb_agg(entry->>'attribute_code' order by entry->>'attribute_code')
   from jsonb_array_elements(pg_temp.profile('own_profile')->'attributes') as entry),
  '["focus_areas", "primary_training_goal", "training_experience", "training_place"]'::jsonb,
  'one entry per attribute with a live claim, and only hers'
);

select results_eq(
  $$ select entry->'values', entry->>'provenance', entry->>'selected_because',
            entry->'alternatives'
     from pg_temp.attribute('own_profile', 'primary_training_goal') as entry $$,
  $$ values ('["build_muscle"]'::jsonb, 'person_declared'::text, 'declared_by_you'::text,
             '[]'::jsonb) $$,
  'a goal she changed shows the one in force; the sealed one is history, not an alternative'
);

select results_eq(
  $$ select entry->'values', entry->>'provenance', entry->>'selected_because'
     from pg_temp.attribute('own_profile', 'training_experience') as entry $$,
  $$ values ('["some_practice"]'::jsonb, 'person_declared'::text, 'declared_by_you'::text) $$,
  'what she declared wins over a newer observation of her coach'
);

select is(
  (select entry->'alternatives'
   from pg_temp.attribute('own_profile', 'training_experience') as entry),
  jsonb_build_array(jsonb_build_object(
    'values', jsonb_build_array('experienced'),
    'provenance', 'professional_observation',
    'valid_from', '2026-09-24T08:00:00+00:00'
  )),
  'and the observation stays visible as an alternative, with where it came from'
);

select results_eq(
  $$ select entry->'values', entry->>'provenance', entry->>'selected_because',
            jsonb_array_length(entry->'alternatives')
     from pg_temp.attribute('own_profile', 'training_place') as entry $$,
  $$ values ('["home"]'::jsonb, 'professional_observation'::text, 'most_recent'::text, 1) $$,
  'without anything of hers, the most recent version is shown and says so'
);

select is(
  (select entry->'values' from pg_temp.attribute('own_profile', 'focus_areas') as entry),
  '["back", "legs"]'::jsonb,
  'a set is shown together, in a stable order'
);

select is(
  (select entry->>'valid_from' from pg_temp.attribute('own_profile', 'primary_training_goal') as entry),
  '2026-08-01T09:00:00+00:00',
  'the entry says since when the version shown holds'
);

select throws_ok(
  $$ select pg_temp.profile('pending_profile') $$,
  '42501', null,
  'a Fitness ID not yet active reads nothing through the profile'
);

select throws_ok(
  $$ select pg_temp.profile('no_person') $$,
  '42501', null,
  'and an account without a person neither'
);

select throws_ok(
  $$ select pg_temp.profile('somebody_unknown') $$,
  '42501', null,
  'nor a subject nobody registered'
);

-- ---------------------------------------------------------------------------
-- Reading my identity
-- ---------------------------------------------------------------------------

select is(
  identity.read_own_identity('workos', 'https://issuer.test', 'own_profile'),
  jsonb_build_object(
    'given_name', 'Camila',
    'family_name', 'Rojas',
    'username', 'camilarojas',
    'active_since', '2026-07-03T10:05:00+00:00',
    'email', jsonb_build_object('address', 'camila@example.test', 'verified', true),
    'phone', jsonb_build_object('number', '+573105550142', 'verified', false),
    'accounts', jsonb_build_array(jsonb_build_object(
      'provider', 'workos', 'linked_at', '2026-07-03T10:00:00+00:00'
    ))
  ),
  'her identity: name, username, since when, her contact and how she signs in'
);

select ok(
  identity.read_own_identity('workos', 'https://issuer.test', 'own_profile')::text
    !~ 'own_profile',
  'the provider subject never leaves the database'
);

select is(
  identity.read_own_identity('workos', 'https://issuer.test', 'other_profile')
    ->'email'->>'verified',
  'false',
  'an unverified email says so'
);

select is(
  identity.read_own_identity('workos', 'https://issuer.test', 'other_profile')->'phone',
  jsonb_build_object('number', null, 'verified', false),
  'no phone reads as none, never as a missing key'
);

select throws_ok(
  $$ select identity.read_own_identity('workos', 'https://issuer.test', 'pending_profile') $$,
  '42501', null,
  'a Fitness ID not yet active has no identity screen'
);

-- ---------------------------------------------------------------------------
-- Correcting my name and username
-- ---------------------------------------------------------------------------

create function pg_temp.rename(
  p_subject text, p_given text, p_family text, p_username text,
  p_key uuid default gen_random_uuid(),
  p_command uuid default extensions.uuid_generate_v7(),
  p_hash bytea default extensions.gen_random_bytes(32)
) returns table (result jsonb, replayed boolean)
language sql as $fn$
  select * from identity.correct_own_name(
    'workos', 'https://issuer.test', p_subject, p_given, p_family, p_username,
    p_key, p_command, p_hash
  )
$fn$;

select results_eq(
  $$ select result, replayed from pg_temp.rename('own_profile', ' Camila ', ' Rojas Díaz ',
       ' CamiRojas ', 'a1000000-0000-4000-8000-000000000001',
       '019f4000-0000-7000-8000-000000000501', decode(repeat('a1', 32), 'hex')) $$,
  $$ values (jsonb_build_object('given_name', 'Camila', 'family_name', 'Rojas Díaz',
               'username', 'camirojas'), false) $$,
  'she corrects her name and username, trimmed, and the handle lower-cased'
);

select results_eq(
  $$ select given_name, family_name, username::text, contact_email::text
     from identity.people where id = '019f4000-0000-7000-8000-000000000001' $$,
  $$ values ('Camila'::text, 'Rojas Díaz'::text, 'camirojas'::text, 'camila@example.test'::text) $$,
  'the person carries the correction, and the contact email is not touched'
);

select results_eq(
  $$ select result->>'username', replayed from pg_temp.rename('own_profile', 'Camila',
       'Rojas Díaz', 'camirojas', 'a1000000-0000-4000-8000-000000000001',
       '019f4000-0000-7000-8000-000000000501', decode(repeat('a1', 32), 'hex')) $$,
  $$ values ('camirojas'::text, true) $$,
  'a retried correction replays instead of writing twice'
);

select throws_ok(
  $$ select * from pg_temp.rename('own_profile', 'Camila', 'Rojas', 'otra',
       'a1000000-0000-4000-8000-000000000001', '019f4000-0000-7000-8000-000000000501',
       decode(repeat('a2', 32), 'hex')) $$,
  '23505', null,
  'the same key with another name is a conflict, not a second correction'
);

select throws_ok(
  $$ select * from pg_temp.rename('own_profile', 'Camila', 'Rojas', 'TAKEN_handle') $$,
  '23505', null,
  'a username somebody else holds is refused, whatever its case'
);

select is(
  (select username::text from identity.people where id = '019f4000-0000-7000-8000-000000000001'),
  'camirojas',
  'and the refused correction leaves hers as it was'
);

select throws_ok(
  $$ select * from pg_temp.rename('own_profile', '   ', 'Rojas', 'camirojas') $$,
  '22023', null,
  'a name cannot be blank'
);

select throws_ok(
  $$ select * from pg_temp.rename('own_profile', 'Camila', 'Rojas', '  ') $$,
  '22023', null,
  'nor can a username'
);

select throws_ok(
  $$ select * from pg_temp.rename('pending_profile', 'Pending', 'Person', 'pending_two') $$,
  '42501', null,
  'a Fitness ID still in onboarding corrects its name through the onboarding, not here'
);

-- ---------------------------------------------------------------------------
-- Correcting my biological sex
-- ---------------------------------------------------------------------------

create function pg_temp.sex(
  p_subject text, p_value text,
  p_key uuid default gen_random_uuid(),
  p_command uuid default extensions.uuid_generate_v7(),
  p_hash bytea default extensions.gen_random_bytes(32)
) returns table (result jsonb, replayed boolean)
language sql as $fn$
  select * from identity.correct_own_biological_sex(
    'workos', 'https://issuer.test', p_subject, p_value, p_key, p_command, p_hash
  )
$fn$;

select results_eq(
  $$ select result, replayed from pg_temp.sex('own_profile', 'male') $$,
  $$ values (jsonb_build_object('biological_sex', 'male'), false) $$,
  'she corrects her biological sex from the profile'
);

select results_eq(
  $$ select result, replayed from pg_temp.sex('own_profile', null) $$,
  $$ values (jsonb_build_object('biological_sex', null), false) $$,
  'declining is a valid answer and clears the value'
);

select is(
  pg_temp.profile('own_profile')->'biological_sex',
  'null'::jsonb,
  'and the profile reads it as unanswered'
);

select throws_ok(
  $$ select * from pg_temp.sex('own_profile', 'unknown') $$,
  '22023', null,
  'a value outside the enum is refused, and nothing is written'
);

select throws_ok(
  $$ select * from pg_temp.sex('pending_profile', 'female') $$,
  '42501', null,
  'a Fitness ID still in onboarding answers through the onboarding'
);

-- ---------------------------------------------------------------------------
-- Declaring the equipment I have
-- ---------------------------------------------------------------------------

create function pg_temp.equipment(
  p_subject text, p_pieces text[],
  p_key uuid default gen_random_uuid(),
  p_command uuid default extensions.uuid_generate_v7(),
  p_hash bytea default extensions.gen_random_bytes(32)
) returns table (result jsonb, replayed boolean)
language sql as $fn$
  select * from identity.declare_available_equipment(
    'workos', 'https://issuer.test', p_subject, p_pieces, p_key, p_command, p_hash
  )
$fn$;

select results_eq(
  $$ select result, replayed from pg_temp.equipment('own_profile',
       array['dumbbell', 'bodyweight'], 'a3000000-0000-4000-8000-000000000001',
       '019f4000-0000-7000-8000-000000000601', decode(repeat('c1', 32), 'hex')) $$,
  $$ values (jsonb_build_object('equipment', jsonb_build_array('bodyweight', 'dumbbell')), false) $$,
  'she declares the equipment she has as a set'
);

create temporary table first_bodyweight on commit drop as
select valid_from from identity.fitness_profile_claims
where person_id = '019f4000-0000-7000-8000-000000000001'
  and attribute_code = 'available_equipment' and value_text = 'bodyweight';

select results_eq(
  $$ select result, replayed from pg_temp.equipment('own_profile',
       array['dumbbell', 'bodyweight'], 'a3000000-0000-4000-8000-000000000001',
       '019f4000-0000-7000-8000-000000000601', decode(repeat('c1', 32), 'hex')) $$,
  $$ values (jsonb_build_object('equipment', jsonb_build_array('bodyweight', 'dumbbell')), true) $$,
  'a retried declaration replays the live set'
);

select results_eq(
  $$ select result from pg_temp.equipment('own_profile', array['bench', 'bodyweight']) $$,
  $$ values (jsonb_build_object('equipment', jsonb_build_array('bench', 'bodyweight'))) $$,
  'declaring again replaces the set'
);

select results_eq(
  $$ select valid_to is not null, superseded_by_id is null
     from identity.fitness_profile_claims
     where person_id = '019f4000-0000-7000-8000-000000000001'
       and attribute_code = 'available_equipment' and value_text = 'dumbbell' $$,
  $$ values (true, true) $$,
  'a piece she no longer has is sealed, not replaced by anything, and not deleted'
);

select is(
  (select valid_from from identity.fitness_profile_claims
   where person_id = '019f4000-0000-7000-8000-000000000001'
     and attribute_code = 'available_equipment' and value_text = 'bodyweight'
     and valid_to is null),
  (select valid_from from first_bodyweight),
  'a piece she still has keeps the moment she first declared it'
);

select results_eq(
  $$ select entry->'values', entry->>'selected_because'
     from pg_temp.attribute('own_profile', 'available_equipment') as entry $$,
  $$ values ('["bench", "bodyweight"]'::jsonb, 'declared_by_you'::text) $$,
  'the profile reads the live set'
);

select throws_ok(
  $$ select * from pg_temp.equipment('own_profile', array[]::text[]) $$,
  '22023', null,
  'an empty set is not an answer'
);

select throws_ok(
  $$ select * from pg_temp.equipment('own_profile', array['bench', 'bench']) $$,
  '22023', null,
  'nor a repeated piece'
);

select throws_ok(
  $$ select * from pg_temp.equipment('own_profile', array['bench', null]) $$,
  '22023', null,
  'nor a null one'
);

select throws_ok(
  $$ select * from pg_temp.equipment('own_profile', array['treadmill']) $$,
  '22023', null,
  'nor one outside the list'
);

select is(
  (select count(*)::integer from identity.fitness_profile_claims
   where person_id = '019f4000-0000-7000-8000-000000000001'
     and attribute_code = 'available_equipment' and valid_to is null),
  2,
  'a refused set leaves the previous one in force, without a partial write'
);

select throws_ok(
  $$ insert into identity.fitness_profile_claims (
       id, person_id, attribute_code, value_text, provenance, captured_by_kind
     ) values (
       extensions.uuid_generate_v7(), '019f4000-0000-7000-8000-000000000001',
       'available_equipment', 'bench', 'person_declared', 'person'
     ) $$,
  '23505', null,
  'the same piece live twice is refused by the database, not only by the command'
);

select throws_ok(
  $$ select * from pg_temp.equipment('no_person', array['bench']) $$,
  '42501', null,
  'an account without a person declares nothing'
);

-- ---------------------------------------------------------------------------
-- Correcting my phone (ADR-050: a contact value, never verified in V1)
-- ---------------------------------------------------------------------------

create function pg_temp.phone(
  p_subject text, p_phone text,
  p_key uuid default gen_random_uuid(),
  p_command uuid default extensions.uuid_generate_v7(),
  p_hash bytea default extensions.gen_random_bytes(32)
) returns table (result jsonb, replayed boolean)
language sql as $fn$
  select * from identity.correct_own_phone(
    'workos', 'https://issuer.test', p_subject, p_phone, p_key, p_command, p_hash
  )
$fn$;

select results_eq(
  $$ select result, replayed from pg_temp.phone('own_profile', ' +57 300 111-2233 ',
       'a6000000-0000-4000-8000-000000000001', '019f4000-0000-7000-8000-000000000601',
       decode(repeat('b1', 32), 'hex')) $$,
  $$ values (jsonb_build_object('number', '+573001112233', 'verified', false), false) $$,
  'she saves her phone in E.164, without spaces or dashes, and it is unverified'
);

select results_eq(
  $$ select contact_phone, contact_phone_verified_at from identity.people
     where id = '019f4000-0000-7000-8000-000000000001' $$,
  $$ values ('+573001112233'::text, null::timestamptz) $$,
  'it is in force at once, with no challenge'
);

select results_eq(
  $$ select result->>'number', replayed from pg_temp.phone('own_profile', '+573001112233',
       'a6000000-0000-4000-8000-000000000001', '019f4000-0000-7000-8000-000000000601',
       decode(repeat('b1', 32), 'hex')) $$,
  $$ values ('+573001112233'::text, true) $$,
  'a retried save replays instead of writing twice'
);

select throws_ok(
  $$ select * from pg_temp.phone('own_profile', '3001112233') $$,
  '22023', null,
  'a number without its country code is refused'
);

select throws_ok(
  $$ select * from pg_temp.phone('own_profile', '+0123') $$,
  '22023', null,
  'and so is one that is not E.164'
);

select lives_ok(
  $$ select * from pg_temp.phone('other_profile', '+573001112233') $$,
  'two people can hold the same unverified number: it proves nothing'
);

select lives_ok(
  $$ update identity.people set contact_phone_verified_at = now()
     where id = '019f4000-0000-7000-8000-000000000001' $$,
  'one of them can hold it verified'
);

select throws_ok(
  $$ update identity.people set contact_phone_verified_at = now()
     where id = '019f4000-0000-7000-8000-000000000002' $$,
  '23505', null,
  'but a verified number stays unique'
);

select is(
  (select result from pg_temp.phone('own_profile', '+573109998877')),
  jsonb_build_object('number', '+573109998877', 'verified', false),
  'a new number drops the verification of the old one'
);

select is(
  (select result from pg_temp.phone('own_profile', null)),
  jsonb_build_object('number', null, 'verified', false),
  'an empty phone removes it'
);

select throws_ok(
  $$ select * from pg_temp.phone('pending_profile', '+573001112233') $$,
  '42501', null,
  'a Fitness ID still in onboarding has no phone to correct here'
);

-- ---------------------------------------------------------------------------
-- The runtime role
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('allfit_api',
    'identity.read_own_profile(text, text, text)', 'execute')
  and has_function_privilege('allfit_api',
    'identity.read_own_identity(text, text, text)', 'execute')
  and has_function_privilege('allfit_api',
    'identity.correct_own_name(text, text, text, text, text, text, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api',
    'identity.correct_own_biological_sex(text, text, text, text, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api',
    'identity.declare_available_equipment(text, text, text, text[], uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api',
    'identity.correct_own_phone(text, text, text, text, uuid, uuid, bytea)', 'execute'),
  'the API runs the six functions'
);

select ok(
  not has_function_privilege('public',
    'identity.read_own_profile(text, text, text)', 'execute'),
  'and nobody else does'
);

select * from finish();
rollback;
