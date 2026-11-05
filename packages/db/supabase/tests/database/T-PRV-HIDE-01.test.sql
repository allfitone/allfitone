-- T-PRV-HIDE-01 — OP-PRV-006, OP-PRV-007 and OP-PRV-017 (HU-SP-032, HU-SP-033, HU-SP-034).
--
-- A person hides one of her sessions from one relationship, takes that back, and
-- sees what she hid:
--
--   · Only her own session, and only from one of her own relationships that is
--     active, or ended with something still frozen to see.
--   · Never a session produced inside that same relationship (IX-36).
--   · One row per session and relationship; hiding twice or restoring twice
--     converges, and a retried command answers the same.
--   · Once a relationship has ended, a denial that was in force fixes
--     `frozen_denied_at`, and restoring never clears it (T-DENY-8, T-DENY-9).
--   · Nobody else reads her denials, not even the gym they are about.
begin;

select plan(46);

insert into identity.people (id, given_name, family_name, status)
values
  ('019f4800-0000-7000-8000-000000000001', 'Ana', 'Client', 'active'),
  ('019f4800-0000-7000-8000-000000000002', 'Bruno', 'Client', 'active'),
  ('019f4800-0000-7000-8000-000000000012', 'Camilo', 'Coach', 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019f4800-0000-7000-8000-000000000101', 'gym', 'Gym A',
   '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}'),
  ('019f4800-0000-7000-8000-000000000102', 'gym', 'Gym B',
   '{"party_kind":"legal_entity","party_name":"Gym B SAS","purpose":"studio_operations"}'),
  ('019f4800-0000-7000-8000-000000000103', 'gym', 'Gym C',
   '{"party_kind":"legal_entity","party_name":"Gym C SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values ('019f4800-0000-7000-8000-000000000212', '019f4800-0000-7000-8000-000000000101', '019f4800-0000-7000-8000-000000000012', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values ('019f4800-0000-7000-8000-000000000212', 'coach');

-- Ana: active with Gym A, ended with Gym B (its grant frozen), ended with Gym C (her
-- grant revoked before, so nothing is left to see); Bruno: active with Gym A.
insert into relationships.service_relationships (id, person_id, organization_id, status, started_at, ended_at, ended_reason)
values
  ('019f4800-0000-7000-8000-000000000701', '019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days', null, null),
  ('019f4800-0000-7000-8000-000000000702', '019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000102', 'terminated', clock_timestamp() - interval '30 days', clock_timestamp() - interval '2 days', 'left'),
  ('019f4800-0000-7000-8000-000000000703', '019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000103', 'terminated', clock_timestamp() - interval '30 days', clock_timestamp() - interval '2 days', 'left'),
  ('019f4800-0000-7000-8000-000000000704', '019f4800-0000-7000-8000-000000000002', '019f4800-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days', null, null);

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, kind, status
) values
  ('019f4800-0000-7000-8000-000000000801', '019f4800-0000-7000-8000-000000000701', '019f4800-0000-7000-8000-000000000001',
   '019f4800-0000-7000-8000-000000000101', '019f4800-0000-7000-8000-000000000212', 'holder', 'active');

insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019f4800-0000-7000-8000-000000000302', 'prior_training_history', 1, 'published', clock_timestamp());
insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values (
  '019f4800-0000-7000-8000-000000000401', '019f4800-0000-7000-8000-000000000101',
  '019f4800-0000-7000-8000-000000000212', 'email', 'ana@example.test',
  extensions.digest('hide-token', 'sha256'), 1, extensions.digest('hide-proposal', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Gym A SAS","purpose":"studio_operations"}',
  'completed', clock_timestamp() + interval '7 days'
);
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f4800-0000-7000-8000-000000000501', '019f4800-0000-7000-8000-000000000401',
  'service_relationship', 'pending', null);
insert into privacy.invitation_scope_options (
  id, invitation_intent_id, scope_definition_id, scope_code,
  offered_access_level, purpose, presented_snapshot, decision, decided_at
) values ('019f4800-0000-7000-8000-000000000602', '019f4800-0000-7000-8000-000000000501',
  '019f4800-0000-7000-8000-000000000302', 'prior_training_history', 'read',
  'Know the history', '{"title":"History"}'::jsonb, 'accepted', clock_timestamp());

create function pg_temp.share(relationship uuid, grant_id uuid, state text)
returns void language plpgsql as $$
declare
  subject record;
begin
  select person_id, organization_id into subject
  from relationships.service_relationships where id = relationship;
  insert into privacy.consent_events (
    id, person_id, relationship_id, organization_id, invitation_scope_option_id,
    scope_definition_id, scope_code, decision, presented_snapshot
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id,
    '019f4800-0000-7000-8000-000000000602', '019f4800-0000-7000-8000-000000000302',
    'prior_training_history', 'accepted', '{"title":"Shared"}'::jsonb
  );
  insert into privacy.data_grants (
    id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
    consent_event_id, access_level, purpose, status, frozen_at, revoked_at
  ) values (
    grant_id, subject.person_id, relationship, subject.organization_id,
    '019f4800-0000-7000-8000-000000000302', 'prior_training_history', grant_id, 'read',
    'Know the history', state::privacy.grant_status,
    case when state = 'frozen' then clock_timestamp() - interval '2 days' end,
    case when state = 'revoked' then clock_timestamp() - interval '3 days' end
  );
end
$$;
select pg_temp.share('019f4800-0000-7000-8000-000000000701', '019f4800-0000-7000-8000-000000000a01', 'active');
select pg_temp.share('019f4800-0000-7000-8000-000000000702', '019f4800-0000-7000-8000-000000000a02', 'frozen');
select pg_temp.share('019f4800-0000-7000-8000-000000000703', '019f4800-0000-7000-8000-000000000a03', 'revoked');

-- S1 and S2 she trained alone, S3 inside Gym A's relationship; S4 is Bruno's.
create function pg_temp.trained(id uuid, person uuid, days integer, context uuid, org uuid)
returns void language sql as $$
  insert into execution.executed_sessions (
    id, person_id, activity_type_id, result_contract_id, contract_version, is_autonomous,
    context_relationship_id, context_organization_id, started_at, ended_at, timezone,
    execution_status, validation_status, requested_level, achieved_level, capture_source
  ) values (
    id, person, '019c0000-0000-7000-8000-000000000011', '019c0000-0000-7000-8000-000000000031', 1,
    context is null, context, org,
    clock_timestamp() - make_interval(days => days), clock_timestamp() - make_interval(days => days) + interval '1 hour',
    'America/Bogota', 'completed', 'valid', 'detailed', 'detailed', 'manual'
  )
$$;
select pg_temp.trained('019f4800-0000-7000-8000-000000000e01', '019f4800-0000-7000-8000-000000000001', 5, null, null);
select pg_temp.trained('019f4800-0000-7000-8000-000000000e02', '019f4800-0000-7000-8000-000000000001', 6, null, null);
select pg_temp.trained('019f4800-0000-7000-8000-000000000e03', '019f4800-0000-7000-8000-000000000001', 3,
  '019f4800-0000-7000-8000-000000000701', '019f4800-0000-7000-8000-000000000101');
select pg_temp.trained('019f4800-0000-7000-8000-000000000e04', '019f4800-0000-7000-8000-000000000002', 4, null, null);

create function pg_temp.act(person uuid) returns void language plpgsql as $$
begin
  perform set_config('app.actor_kind', 'person', true);
  perform set_config('app.actor_person_id', person::text, true);
  perform set_config('app.actor_org_id', '', true);
  perform set_config('app.actor_membership_id', '', true);
  perform set_config('app.contract_scope_purpose', '', true);
  perform set_config('app.contract_scope_id', '', true);
  perform set_config('app.contract_scope_token', '', true);
  perform set_config('app.request_id', gen_random_uuid()::text, true);
end
$$;

-- P0004 is `assert_failure`, which `others` does not catch.
create function pg_temp.sqlstate(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'no error';
exception when others or assert_failure then
  return sqlstate;
end
$$;

create function pg_temp.violated(statement text) returns text language plpgsql as $$
declare
  state text;
  name text;
begin
  execute statement;
  return 'no error';
exception when others then
  get stacked diagnostics state = returned_sqlstate, name = constraint_name;
  return state || ' ' || coalesce(name, '');
end
$$;

-- Each command its own key and id, so a repeat is a new decision, not a replay.
create function pg_temp.hide(person uuid, session uuid, relationship uuid, key uuid default gen_random_uuid())
returns table (result jsonb, replayed boolean) language sql as $$
  select * from privacy.hide_session(person, session, relationship, key,
    extensions.uuid_generate_v7(), extensions.digest(session::text || relationship::text, 'sha256'))
$$;
create function pg_temp.restore(person uuid, session uuid, relationship uuid, key uuid default gen_random_uuid())
returns table (result jsonb, replayed boolean) language sql as $$
  select * from privacy.restore_session(person, session, relationship, key,
    extensions.uuid_generate_v7(), extensions.digest(session::text || relationship::text, 'sha256'))
$$;

create function pg_temp.events(kind text) returns integer language sql as $$
  select count(*)::integer from system.outbox_events where event_type = kind
$$;

-- ---------------------------------------------------------------------------
-- OP-PRV-006: hiding
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f4800-0000-7000-8000-000000000001');
create temporary table first_hide on commit drop as
select * from pg_temp.hide('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e01',
  '019f4800-0000-7000-8000-000000000701', '7c000000-0000-4000-8000-000000000001');
reset role;

select is(
  (select result - 'denied_at' - 'session' from first_hide),
  '{"executed_session_id": "019f4800-0000-7000-8000-000000000e01", "relationship_id": "019f4800-0000-7000-8000-000000000701",
    "organization": {"id": "019f4800-0000-7000-8000-000000000101", "display_name": "Gym A"},
    "status": "active", "restored_at": null}'::jsonb,
  'T-PRV-HIDE-API-01 she hides a session she trained alone from the gym she trains with');
select is((select replayed from first_hide), false, 'T-PRV-HIDE-API-02 as a new decision');
select results_eq(
  $$select status, frozen_denied_at is null, person_id from privacy.session_visibility_denials
    where executed_session_id = '019f4800-0000-7000-8000-000000000e01'$$,
  $$values ('active', true, '019f4800-0000-7000-8000-000000000001'::uuid)$$,
  'T-PRV-HIDE-API-03 one denial, in force, with no frozen window while the relationship lasts');
select is(pg_temp.events('privacy.session_visibility_denied.v1'), 1, 'T-PRV-HIDE-API-04 and one event says so');
select is(
  (select payload from system.outbox_events where event_type = 'privacy.session_visibility_denied.v1'),
  '{"executed_session_id": "019f4800-0000-7000-8000-000000000e01", "relationship_id": "019f4800-0000-7000-8000-000000000701"}'::jsonb,
  'T-PRV-HIDE-API-05 naming the session and the relationship, nothing of what was trained');

set local role allfit_api;
select pg_temp.act('019f4800-0000-7000-8000-000000000001');
select is(
  (select replayed from pg_temp.hide('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e01',
     '019f4800-0000-7000-8000-000000000701', '7c000000-0000-4000-8000-000000000001')),
  true, 'T-PRV-HIDE-IDEM-01 a retried command replays');
select is(
  (select result->>'denied_at' from pg_temp.hide('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e01',
     '019f4800-0000-7000-8000-000000000701')),
  (select result->>'denied_at' from first_hide),
  'T-PRV-HIDE-IDEM-02 hiding it again converges on the same denial');
reset role;
select is(pg_temp.events('privacy.session_visibility_denied.v1'), 1, 'T-PRV-HIDE-IDEM-03 and announces nothing twice');
select is(
  (select count(*)::integer from privacy.session_visibility_denials where executed_session_id = '019f4800-0000-7000-8000-000000000e01'),
  1, 'T-PRV-HIDE-IDEM-04 still one row for the pair');

set local role allfit_api;
select pg_temp.act('019f4800-0000-7000-8000-000000000001');
select is(
  pg_temp.sqlstate($$select pg_temp.hide('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e03', '019f4800-0000-7000-8000-000000000701')$$),
  '22023', 'T-PRV-HIDE-API-06 what she trained inside a relationship cannot be hidden from it (T-DENY-7)');
select is(
  (select result->>'status' from pg_temp.hide('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e03', '019f4800-0000-7000-8000-000000000702')),
  'active', 'T-PRV-HIDE-API-07 but it can from another one');
select is(
  pg_temp.sqlstate($$select pg_temp.hide('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e01', '019f4800-0000-7000-8000-000000000703')$$),
  'P0004', 'T-PRV-HIDE-API-08 an ended relationship with nothing left to see has nothing to hide from');
select is(
  pg_temp.sqlstate($$select pg_temp.hide('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e04', '019f4800-0000-7000-8000-000000000701')$$),
  'P0002', 'T-PRV-HIDE-API-09 somebody else''s session does not exist for her');
select is(
  pg_temp.sqlstate($$select pg_temp.hide('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e01', '019f4800-0000-7000-8000-000000000704')$$),
  'P0002', 'T-PRV-HIDE-API-10 nor somebody else''s relationship');
select is(
  pg_temp.sqlstate($$select pg_temp.hide('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e99', '019f4800-0000-7000-8000-000000000701')$$),
  'P0002', 'T-PRV-HIDE-API-11 nor a session that never was');
select is(
  pg_temp.sqlstate($$select pg_temp.hide('019f4800-0000-7000-8000-000000000002', '019f4800-0000-7000-8000-000000000e04', '019f4800-0000-7000-8000-000000000704')$$),
  '42501', 'T-PRV-HIDE-API-12 nobody hides as somebody else');
reset role;

select is(
  (select frozen_denied_at is not null from privacy.session_visibility_denials
   where executed_session_id = '019f4800-0000-7000-8000-000000000e03' and relationship_id = '019f4800-0000-7000-8000-000000000702'),
  true, 'T-PRV-HIDE-INT-01 hidden after the relationship ended, the frozen window shrinks for good (T-DENY-8)');

-- ---------------------------------------------------------------------------
-- OP-PRV-007: taking it back
-- ---------------------------------------------------------------------------
set local role allfit_api;
select pg_temp.act('019f4800-0000-7000-8000-000000000001');
create temporary table first_restore on commit drop as
select * from pg_temp.restore('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e01',
  '019f4800-0000-7000-8000-000000000701', '7c000000-0000-4000-8000-000000000002');
reset role;
select is(
  (select (result->>'status', result->>'restored_at' is not null, replayed)::text from first_restore),
  '(reverted,t,f)', 'T-PRV-HIDE-API-13 she shares it again');
select is(pg_temp.events('privacy.session_visibility_restored.v1'), 1, 'T-PRV-HIDE-API-14 and one event says so');

set local role allfit_api;
select pg_temp.act('019f4800-0000-7000-8000-000000000001');
select is(
  (select replayed from pg_temp.restore('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e01',
     '019f4800-0000-7000-8000-000000000701', '7c000000-0000-4000-8000-000000000002')),
  true, 'T-PRV-HIDE-IDEM-05 a retried restore replays');
select is(
  (select result->>'restored_at' from pg_temp.restore('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e01',
     '019f4800-0000-7000-8000-000000000701')),
  (select result->>'restored_at' from first_restore),
  'T-PRV-HIDE-IDEM-06 restoring again converges');
reset role;
select is(pg_temp.events('privacy.session_visibility_restored.v1'), 1, 'T-PRV-HIDE-IDEM-07 and announces nothing twice');

set local role allfit_api;
select pg_temp.act('019f4800-0000-7000-8000-000000000001');
select is(
  (select (result->>'status', result->'restored_at')::text from pg_temp.hide('019f4800-0000-7000-8000-000000000001',
     '019f4800-0000-7000-8000-000000000e01', '019f4800-0000-7000-8000-000000000701')),
  '(active,null)', 'T-PRV-HIDE-API-15 and can hide it once more, as the same pair');
select is(
  pg_temp.sqlstate($$select pg_temp.restore('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e02', '019f4800-0000-7000-8000-000000000701')$$),
  'P0002', 'T-PRV-HIDE-API-16 there is nothing to take back where she never hid anything');
select is(
  pg_temp.sqlstate($$select pg_temp.restore('019f4800-0000-7000-8000-000000000002', '019f4800-0000-7000-8000-000000000e01', '019f4800-0000-7000-8000-000000000701')$$),
  '42501', 'T-PRV-HIDE-API-17 nobody restores as somebody else');
reset role;
select is(pg_temp.events('privacy.session_visibility_denied.v1'), 3, 'T-PRV-HIDE-API-18 hiding it again is a new decision, announced');

-- Hidden after Gym B's end: restoring does not reopen the frozen window (T-DENY-9).
select frozen_denied_at as gym_b_frozen from privacy.session_visibility_denials
where executed_session_id = '019f4800-0000-7000-8000-000000000e03' and relationship_id = '019f4800-0000-7000-8000-000000000702' \gset
set local role allfit_api;
select pg_temp.act('019f4800-0000-7000-8000-000000000001');
select pg_temp.restore('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e03', '019f4800-0000-7000-8000-000000000702');
reset role;
select results_eq(
  $$select status, frozen_denied_at from privacy.session_visibility_denials
    where executed_session_id = '019f4800-0000-7000-8000-000000000e03' and relationship_id = '019f4800-0000-7000-8000-000000000702'$$,
  format($$values ('reverted', %L::timestamptz)$$, :'gym_b_frozen'),
  'T-PRV-HIDE-INT-02 restoring after the end never clears the frozen window');

-- In force when Gym A's relationship ends: the end fixes the window, restoring keeps it.
set local role allfit_api;
select pg_temp.act('019f4800-0000-7000-8000-000000000001');
select pg_temp.hide('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e02', '019f4800-0000-7000-8000-000000000701');
reset role;
select relationships.close_relationship('019f4800-0000-7000-8000-000000000701', clock_timestamp(), 'person', 'left');
select ended_at as gym_a_ended from relationships.service_relationships where id = '019f4800-0000-7000-8000-000000000701' \gset
set local role allfit_api;
select pg_temp.act('019f4800-0000-7000-8000-000000000001');
select pg_temp.restore('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e02', '019f4800-0000-7000-8000-000000000701');
reset role;
select results_eq(
  $$select status, frozen_denied_at from privacy.session_visibility_denials
    where executed_session_id = '019f4800-0000-7000-8000-000000000e02' and relationship_id = '019f4800-0000-7000-8000-000000000701'$$,
  format($$values ('reverted', %L::timestamptz)$$, :'gym_a_ended'),
  'T-PRV-HIDE-INT-03 a denial in force at the end keeps that instant as its frozen window (T-DENY-8)');

-- ---------------------------------------------------------------------------
-- OP-PRV-017: what she hid
-- ---------------------------------------------------------------------------
select started_at as e01_started from execution.executed_sessions
where id = '019f4800-0000-7000-8000-000000000e01' \gset
set local role allfit_api;
select pg_temp.act('019f4800-0000-7000-8000-000000000001');
select is(
  (select array_agg(executed_session_id::text || '/' || relationship_id::text order by denied_at desc, id desc)
   from privacy.list_my_session_denials('019f4800-0000-7000-8000-000000000001', 20, null, null)),
  array['019f4800-0000-7000-8000-000000000e01/019f4800-0000-7000-8000-000000000701'],
  'T-PRV-HIDE-API-19 she sees what she still hides, and not what she took back');
select results_eq(
  $$select organization_id, organization_name, session_started_at, activity_type_name is not null
    from privacy.list_my_session_denials('019f4800-0000-7000-8000-000000000001', 20, null, null)$$,
  format($$values ('019f4800-0000-7000-8000-000000000101'::uuid, 'Gym A'::text, %L::timestamptz, true)$$, :'e01_started'),
  'T-PRV-HIDE-API-20 with the gym and the session it is about');
select pg_temp.hide('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e02', '019f4800-0000-7000-8000-000000000702');
select is(
  (select array_agg(executed_session_id order by denied_at desc, id desc)
   from privacy.list_my_session_denials('019f4800-0000-7000-8000-000000000001', 1, null, null)),
  array['019f4800-0000-7000-8000-000000000e02'::uuid],
  'T-PRV-HIDE-API-21 newest first, a page at a time');
select is(
  (select array_agg(listed.executed_session_id)
   from privacy.list_my_session_denials('019f4800-0000-7000-8000-000000000001', 1,
     (select date_trunc('milliseconds', denied_at) from privacy.list_my_session_denials('019f4800-0000-7000-8000-000000000001', 1, null, null)),
     (select id from privacy.list_my_session_denials('019f4800-0000-7000-8000-000000000001', 1, null, null))) as listed),
  array['019f4800-0000-7000-8000-000000000e01'::uuid],
  'T-PRV-HIDE-API-22 and the next page starts right after');
select pg_temp.act('019f4800-0000-7000-8000-000000000002');
select is(
  (select count(*)::integer from privacy.list_my_session_denials('019f4800-0000-7000-8000-000000000002', 20, null, null)),
  0, 'T-PRV-HIDE-API-23 Bruno sees none of hers');
select is(
  pg_temp.sqlstate($$select privacy.list_my_session_denials('019f4800-0000-7000-8000-000000000001', 20, null, null)$$),
  '42501', 'T-PRV-HIDE-API-24 nor can he ask for them');
reset role;

-- ---------------------------------------------------------------------------
-- Invariants
-- ---------------------------------------------------------------------------
select is(
  pg_temp.violated($sql$
    insert into privacy.session_visibility_denials (person_id, executed_session_id, relationship_id, status, denied_at)
    values ('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e03',
            '019f4800-0000-7000-8000-000000000701', 'active', clock_timestamp())$sql$),
  '23514 trg_session_visibility_denials_after_insert_own_relationship',
  'T-PRV-HIDE-INT-04 the database itself refuses hiding a session from the relationship it was produced in (IX-36)');
select is(
  pg_temp.violated($sql$
    insert into privacy.session_visibility_denials (person_id, executed_session_id, relationship_id, status, denied_at)
    values ('019f4800-0000-7000-8000-000000000002', '019f4800-0000-7000-8000-000000000e01',
            '019f4800-0000-7000-8000-000000000704', 'active', clock_timestamp())$sql$),
  '23503 fk_session_visibility_denials_session',
  'T-PRV-HIDE-INT-05 the session belongs to whoever decides (IX-08)');
select is(
  pg_temp.violated($sql$
    insert into privacy.session_visibility_denials (person_id, executed_session_id, relationship_id, status, denied_at)
    values ('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e01',
            '019f4800-0000-7000-8000-000000000704', 'active', clock_timestamp())$sql$),
  '23503 fk_session_visibility_denials_relationship',
  'T-PRV-HIDE-INT-06 and so does the relationship (IX-08)');
select is(
  pg_temp.violated($sql$
    insert into privacy.session_visibility_denials (person_id, executed_session_id, relationship_id, status, denied_at)
    values ('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e01',
            '019f4800-0000-7000-8000-000000000701', 'active', clock_timestamp())$sql$),
  '23505 uq_session_visibility_denials_pair',
  'T-PRV-HIDE-INT-07 one row per session and relationship');
select is(
  pg_temp.violated($sql$
    update privacy.session_visibility_denials set frozen_denied_at = null
    where executed_session_id = '019f4800-0000-7000-8000-000000000e03'$sql$),
  '23514 ',
  'T-PRV-HIDE-INT-08 a frozen window is never cleared');
select is(
  pg_temp.violated($sql$
    update privacy.session_visibility_denials set relationship_id = '019f4800-0000-7000-8000-000000000702'
    where executed_session_id = '019f4800-0000-7000-8000-000000000e01' and relationship_id = '019f4800-0000-7000-8000-000000000701'$sql$),
  '23514 ',
  'T-PRV-HIDE-INT-09 nor does a denial move to another session or relationship');
select is(
  pg_temp.violated($sql$
    update privacy.session_visibility_denials set status = 'reverted', restored_at = null
    where executed_session_id = '019f4800-0000-7000-8000-000000000e01' and relationship_id = '019f4800-0000-7000-8000-000000000701'$sql$),
  '23514 ck_session_visibility_denials_restored',
  'T-PRV-HIDE-INT-10 taken back means when');

-- ---------------------------------------------------------------------------
-- Row policies
-- ---------------------------------------------------------------------------
set local role allfit_owner;
select pg_temp.act('019f4800-0000-7000-8000-000000000001');
select is(
  (select count(*)::integer from privacy.session_visibility_denials),
  4, 'T-PRV-HIDE-RLS-01 session_visibility_denials_all_self: she reads all of hers');
select pg_temp.act('019f4800-0000-7000-8000-000000000002');
select is(
  (select count(*)::integer from privacy.session_visibility_denials),
  0, 'T-PRV-HIDE-RLS-02 nobody else reads them');
select is(
  pg_temp.sqlstate($sql$
    insert into privacy.session_visibility_denials (person_id, executed_session_id, relationship_id, status, denied_at)
    values ('019f4800-0000-7000-8000-000000000001', '019f4800-0000-7000-8000-000000000e01',
            '019f4800-0000-7000-8000-000000000702', 'active', clock_timestamp())$sql$),
  '42501', 'T-PRV-HIDE-RLS-03 nor writes one for her');
select set_config('app.actor_org_id', '019f4800-0000-7000-8000-000000000101', true),
       set_config('app.actor_membership_id', '019f4800-0000-7000-8000-000000000212', true),
       set_config('app.actor_person_id', '019f4800-0000-7000-8000-000000000012', true);
select is(
  (select count(*)::integer from privacy.session_visibility_denials),
  0, 'T-PRV-HIDE-RLS-04 not even the gym they are about');
reset role;

select ok(
  has_function_privilege('allfit_api', 'privacy.hide_session(uuid, uuid, uuid, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api', 'privacy.restore_session(uuid, uuid, uuid, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api', 'privacy.list_my_session_denials(uuid, integer, timestamptz, uuid)', 'execute')
  and not has_function_privilege('public', 'privacy.hide_session(uuid, uuid, uuid, uuid, uuid, bytea)', 'execute')
  and not has_function_privilege('public', 'privacy.restore_session(uuid, uuid, uuid, uuid, uuid, bytea)', 'execute')
  and not has_function_privilege('public', 'privacy.list_my_session_denials(uuid, integer, timestamptz, uuid)', 'execute')
  and not has_table_privilege('allfit_api', 'privacy.session_visibility_denials', 'select'),
  'T-PRV-HIDE-API-25 the API runs the three operations and reads nothing directly');

select * from finish();
rollback;
