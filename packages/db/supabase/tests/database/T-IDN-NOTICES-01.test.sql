-- T-IDN-NOTICES-01 — every mapped event leaves one notice for its recipient (ADR-054,
-- `HU-SP-091`). TECH-44.
--
-- The notice is born from the event, in its transaction: each mapped event writes exactly
-- one notice for the person it addresses and a rolled-back event leaves none (scenario 1).
-- The actor is never told what she did herself (scenario 2). A notice keeps kind,
-- category, subject, organization and instants, and no words (scenario 3). A channel
-- turned off leaves the notice in her inbox (scenario 5), and push gets one pending
-- delivery per active phone only while it is on for the category (scenario 7, the part
-- the database owns).
--
-- `identity.password_changed.v1` and `identity.contact_changed.v1` are in ADR-054's map,
-- but in V1 the person herself is always their actor, so rule 4 leaves them with no
-- notice. That conflict is open in ADR-054; this test records what the database does.
--
-- Written before the migration and watched failing.
begin;

select plan(38);

select has_table('identity', 'person_notifications', 'T-IDN-PHY-34 notices kept for the person have their own table');
select columns_are('identity', 'person_notifications', array[
  'id', 'person_id', 'source_event_id', 'kind', 'category', 'subject_type', 'subject_id',
  'organization_id', 'occurred_at', 'read_at'],
  'T-IDN-PHY-34 a notice holds no words and none of the person''s data: only what points to it');
select has_table('system', 'notification_deliveries', 'T-IDN-PHY-35 a push per notice and phone has its own table');
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity) from pg_catalog.pg_class
   where oid in ('identity.person_notifications'::regclass, 'system.notification_deliveries'::regclass)),
  'T-IDN-PHY-35 row security is on and forced on both');

-- ———————————————————————————————— who, and what they point at

set local session_replication_role = replica;

insert into identity.people (id, given_name, family_name, contact_email, contact_email_verified_at, status)
values ('019f8500-0000-7000-8000-000000000001', 'Ana', 'Cliente', 'ana.notice@example.test', clock_timestamp(), 'active'),
       ('019f8500-0000-7000-8000-000000000003', 'Camilo', 'Coach', 'camilo.notice@example.test', clock_timestamp(), 'active'),
       ('019f8500-0000-7000-8000-000000000004', 'Diana', 'Cover', null, null, 'active'),
       ('019f8500-0000-7000-8000-000000000005', 'Sin', 'Verificar', 'sinverificar.notice@example.test', null, 'active');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019f8500-0000-7000-8000-000000000101', 'gym', 'Gym Norte',
  '{"party_kind":"legal_entity","party_name":"Gym Norte SAS","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id, status)
values ('019f8500-0000-7000-8000-000000000203', '019f8500-0000-7000-8000-000000000101', '019f8500-0000-7000-8000-000000000003', 'active'),
       ('019f8500-0000-7000-8000-000000000204', '019f8500-0000-7000-8000-000000000101', '019f8500-0000-7000-8000-000000000004', 'active');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values ('019f8500-0000-7000-8000-000000000701', '019f8500-0000-7000-8000-000000000001',
        '019f8500-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days');

insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id, kind, status, ends_on
) values
  ('019f8500-0000-7000-8000-000000000801', '019f8500-0000-7000-8000-000000000701', '019f8500-0000-7000-8000-000000000001',
   '019f8500-0000-7000-8000-000000000101', '019f8500-0000-7000-8000-000000000203', null, 'holder', 'active', null),
  ('019f8500-0000-7000-8000-000000000802', '019f8500-0000-7000-8000-000000000701', '019f8500-0000-7000-8000-000000000001',
   '019f8500-0000-7000-8000-000000000101', '019f8500-0000-7000-8000-000000000204', '019f8500-0000-7000-8000-000000000203', 'substitute', 'proposed', current_date + 10);

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values
  ('019f8500-0000-7000-8000-000000000401', '019f8500-0000-7000-8000-000000000101',
   '019f8500-0000-7000-8000-000000000203', 'email', 'ANA.notice@example.test',
   extensions.digest('n-token-1', 'sha256'), 1, extensions.digest('n-proposal-1', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym Norte SAS","purpose":"studio_operations"}',
   'pending', clock_timestamp() + interval '7 days'),
  ('019f8500-0000-7000-8000-000000000402', '019f8500-0000-7000-8000-000000000101',
   '019f8500-0000-7000-8000-000000000203', 'email', 'nobody.yet@example.test',
   extensions.digest('n-token-2', 'sha256'), 1, extensions.digest('n-proposal-2', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym Norte SAS","purpose":"studio_operations"}',
   'pending', clock_timestamp() + interval '7 days'),
  ('019f8500-0000-7000-8000-000000000403', '019f8500-0000-7000-8000-000000000101',
   '019f8500-0000-7000-8000-000000000203', 'email', 'sinverificar.notice@example.test',
   extensions.digest('n-token-3', 'sha256'), 1, extensions.digest('n-proposal-3', 'sha256'),
   '{"party_kind":"legal_entity","party_name":"Gym Norte SAS","purpose":"studio_operations"}',
   'pending', clock_timestamp() + interval '7 days');
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f8500-0000-7000-8000-000000000501', '019f8500-0000-7000-8000-000000000401', 'service_relationship', 'pending', null),
       ('019f8500-0000-7000-8000-000000000502', '019f8500-0000-7000-8000-000000000402', 'service_relationship', 'pending', null),
       ('019f8500-0000-7000-8000-000000000503', '019f8500-0000-7000-8000-000000000403', 'service_relationship', 'pending', null);

insert into execution.correction_proposals (
  id, person_id, relationship_id, organization_id, proposer_assignment_id, proposer_membership_id,
  executed_session_id, target_strength_set_id, set_order, target_field, current_value,
  proposed_value, reason, status, created_at, expires_at
) values (
  '019f8500-0000-7000-8000-000000000901', '019f8500-0000-7000-8000-000000000001',
  '019f8500-0000-7000-8000-000000000701', '019f8500-0000-7000-8000-000000000101',
  '019f8500-0000-7000-8000-000000000801', '019f8500-0000-7000-8000-000000000203',
  gen_random_uuid(), gen_random_uuid(), 1, 'achieved_reps', 8, 10, 'Contaste mal', 'pending',
  now(), now() + interval '30 days');

-- Ana's phones: one in her pocket, one she signed out of.
insert into identity.person_push_devices (id, person_id, platform, push_token, retired_at, retired_reason)
values ('a5000000-0000-4000-8000-000000000001', '019f8500-0000-7000-8000-000000000001', 'ios', 'ExponentPushToken[ana-on]', null, null),
       ('a5000000-0000-4000-8000-000000000002', '019f8500-0000-7000-8000-000000000001', 'android', 'ExponentPushToken[ana-off]', clock_timestamp(), 'sign_out');

-- She turned off push for nutrition and email for everything about her relationship.
insert into identity.notification_preferences (person_id, category, channel, enabled)
values ('019f8500-0000-7000-8000-000000000001', 'nutrition', 'push', false),
       ('019f8500-0000-7000-8000-000000000001', 'relationship', 'email', false);

set local session_replication_role = origin;

-- ———————————————————————————————— the events, raised by the coach

create function pg_temp.raise(p_type text, p_aggregate uuid, p_payload jsonb) returns uuid
language sql as $fn$
  select system.enqueue_outbox_event(split_part(p_type, '.', 1), p_aggregate, p_type, p_payload)
$fn$;

create function pg_temp.notices_of(p_event uuid) returns text[]
language sql as $fn$
  select coalesce(array_agg(person_id::text || ' ' || kind || ' ' || category || ' ' || subject_type
           || ' ' || subject_id::text || ' ' || coalesce(organization_id::text, '-') order by id), '{}')
  from identity.person_notifications where source_event_id = p_event
$fn$;

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8500-0000-7000-8000-000000000003', true);

create temporary table raised (label text primary key, event_id uuid);

insert into raised values
  ('invited', pg_temp.raise('relationship.client_invited.v1', '019f8500-0000-7000-8000-000000000401',
     '{"invitation_id": "019f8500-0000-7000-8000-000000000401"}')),
  ('invited-stranger', pg_temp.raise('relationship.client_invited.v1', '019f8500-0000-7000-8000-000000000402',
     '{"invitation_id": "019f8500-0000-7000-8000-000000000402"}')),
  ('invited-unverified', pg_temp.raise('relationship.client_invited.v1', '019f8500-0000-7000-8000-000000000403',
     '{"invitation_id": "019f8500-0000-7000-8000-000000000403"}')),
  ('cover', pg_temp.raise('relationship.substitution_proposed.v1', '019f8500-0000-7000-8000-000000000701',
     '{"relationship_id": "019f8500-0000-7000-8000-000000000701", "organization_id": "019f8500-0000-7000-8000-000000000101",
       "person_id": "019f8500-0000-7000-8000-000000000001", "assignment_id": "019f8500-0000-7000-8000-000000000802"}')),
  ('reassigned', pg_temp.raise('relationship.professional_reassigned.v1', '019f8500-0000-7000-8000-000000000701',
     '{"relationship_id": "019f8500-0000-7000-8000-000000000701", "organization_id": "019f8500-0000-7000-8000-000000000101",
       "person_id": "019f8500-0000-7000-8000-000000000001", "assignment_id": "019f8500-0000-7000-8000-000000000801"}')),
  ('ended', pg_temp.raise('relationship.terminated.v1', '019f8500-0000-7000-8000-000000000701',
     '{"relationship_id": "019f8500-0000-7000-8000-000000000701", "contact_email": "ana.notice@example.test"}')),
  ('paused', pg_temp.raise('payments.subscription_suspended.v1', '019f8500-0000-7000-8000-000000000a01',
     '{"subscription_id": "019f8500-0000-7000-8000-000000000a01", "person_id": "019f8500-0000-7000-8000-000000000001",
       "organization_id": "019f8500-0000-7000-8000-000000000101"}')),
  ('resumed', pg_temp.raise('payments.subscription_reactivated.v1', '019f8500-0000-7000-8000-000000000a01',
     '{"subscription_id": "019f8500-0000-7000-8000-000000000a01", "person_id": "019f8500-0000-7000-8000-000000000001",
       "organization_id": "019f8500-0000-7000-8000-000000000101"}')),
  ('plan-ended', pg_temp.raise('payments.subscription_ended.v1', '019f8500-0000-7000-8000-000000000a01',
     '{"subscription_id": "019f8500-0000-7000-8000-000000000a01", "person_id": "019f8500-0000-7000-8000-000000000001",
       "organization_id": "019f8500-0000-7000-8000-000000000101"}')),
  ('assigned', pg_temp.raise('planning.assignment_created.v1', '019f8500-0000-7000-8000-000000000b01',
     '{"assignment_id": "019f8500-0000-7000-8000-000000000b01", "person_id": "019f8500-0000-7000-8000-000000000001",
       "relationship_id": "019f8500-0000-7000-8000-000000000701"}')),
  ('correction', pg_temp.raise('execution.correction_proposed.v1', '019f8500-0000-7000-8000-000000000901',
     '{"proposal_id": "019f8500-0000-7000-8000-000000000901"}')),
  ('goal', pg_temp.raise('nutrition.goal_version_proposed.v1', '019f8500-0000-7000-8000-000000000c01',
     '{"goal_version_id": "019f8500-0000-7000-8000-000000000c01", "person_id": "019f8500-0000-7000-8000-000000000001",
       "relationship_id": "019f8500-0000-7000-8000-000000000701", "organization_id": "019f8500-0000-7000-8000-000000000101"}')),
  ('expired', pg_temp.raise('identity.invitation_expired.v1', '019f8500-0000-7000-8000-000000000401',
     '{"invitation_id": "019f8500-0000-7000-8000-000000000401"}'));

create function pg_temp.of(p_label text) returns text[]
language sql as $fn$ select pg_temp.notices_of((select event_id from raised where label = p_label)) $fn$;

-- ———————————————————————————————— scenario 1: one notice per mapped event

select is(pg_temp.of('invited'),
  array['019f8500-0000-7000-8000-000000000001 client_invitation relationship invitation 019f8500-0000-7000-8000-000000000401 019f8500-0000-7000-8000-000000000101'],
  'T-IDN-INT-63 an invitation to her verified email is a notice for her');
select is(pg_temp.of('invited-stranger'), '{}'::text[],
  'T-IDN-INT-63 an invitation to an address no person holds stays an email only');
select is(pg_temp.of('invited-unverified'), '{}'::text[],
  'T-IDN-INT-63 and so does one to an address nobody has verified');
select is(pg_temp.of('cover'),
  array['019f8500-0000-7000-8000-000000000001 cover_proposed relationship relationship_professional_assignment 019f8500-0000-7000-8000-000000000802 019f8500-0000-7000-8000-000000000101'],
  'T-IDN-INT-64 a proposed cover points at the cover');
select is(pg_temp.of('reassigned'),
  array['019f8500-0000-7000-8000-000000000001 professional_changed relationship relationship_professional_assignment 019f8500-0000-7000-8000-000000000801 019f8500-0000-7000-8000-000000000101'],
  'T-IDN-INT-64 a new coach points at the new assignment');
select is(pg_temp.of('ended'),
  array['019f8500-0000-7000-8000-000000000001 relationship_ended relationship service_relationship 019f8500-0000-7000-8000-000000000701 019f8500-0000-7000-8000-000000000101'],
  'T-IDN-INT-65 an ended relationship finds its person through the relationship');
select is(pg_temp.of('paused'),
  array['019f8500-0000-7000-8000-000000000001 plan_paused relationship plan_subscription 019f8500-0000-7000-8000-000000000a01 019f8500-0000-7000-8000-000000000101'],
  'T-IDN-INT-66 a suspended plan is a paused plan');
select is(pg_temp.of('resumed'),
  array['019f8500-0000-7000-8000-000000000001 plan_resumed relationship plan_subscription 019f8500-0000-7000-8000-000000000a01 019f8500-0000-7000-8000-000000000101'],
  'T-IDN-INT-66 a reactivated one is resumed');
select is(pg_temp.of('plan-ended'),
  array['019f8500-0000-7000-8000-000000000001 plan_ended relationship plan_subscription 019f8500-0000-7000-8000-000000000a01 019f8500-0000-7000-8000-000000000101'],
  'T-IDN-INT-66 and an ended one is ended');
select is(pg_temp.of('assigned'),
  array['019f8500-0000-7000-8000-000000000001 program_assigned assignment program_assignment 019f8500-0000-7000-8000-000000000b01 019f8500-0000-7000-8000-000000000101'],
  'T-IDN-INT-67 a program assigned by the coach names the gym of its relationship');
select is(pg_temp.of('correction'),
  array['019f8500-0000-7000-8000-000000000001 correction_proposed correction correction_proposal 019f8500-0000-7000-8000-000000000901 019f8500-0000-7000-8000-000000000101'],
  'T-IDN-INT-68 a proposed correction finds its person through the proposal');
select is(pg_temp.of('goal'),
  array['019f8500-0000-7000-8000-000000000001 goal_proposed nutrition nutrition_goal_version 019f8500-0000-7000-8000-000000000c01 019f8500-0000-7000-8000-000000000101'],
  'T-IDN-INT-69 a proposed nutrition goal is a notice');
select is(pg_temp.of('expired'), '{}'::text[], 'T-IDN-INT-70 an event outside the map writes nothing');
select is(
  (select count(*)::integer from identity.person_notifications
   where person_id = '019f8500-0000-7000-8000-000000000001'),
  10, 'T-IDN-INT-70 ten mapped events, ten notices, one each');

-- ———————————————————————————————— rolled back with its event

savepoint before_rollback;
insert into raised values ('doomed', pg_temp.raise('payments.subscription_suspended.v1', '019f8500-0000-7000-8000-000000000a02',
  '{"subscription_id": "019f8500-0000-7000-8000-000000000a02", "person_id": "019f8500-0000-7000-8000-000000000001",
    "organization_id": "019f8500-0000-7000-8000-000000000101"}'));
select is(array_length(pg_temp.of('doomed'), 1), 1, 'T-IDN-INT-71 the notice exists inside the event''s transaction');
rollback to savepoint before_rollback;
select is(
  (select count(*)::integer from identity.person_notifications where subject_id = '019f8500-0000-7000-8000-000000000a02'),
  0, 'T-IDN-INT-71 and an event rolled back leaves none');

-- ———————————————————————————————— scenario 2: nobody is told what she did herself

select set_config('app.actor_person_id', '019f8500-0000-7000-8000-000000000001', true);
insert into raised values
  ('cancelled-herself', pg_temp.raise('payments.subscription_ended.v1', '019f8500-0000-7000-8000-000000000a03',
     '{"subscription_id": "019f8500-0000-7000-8000-000000000a03", "person_id": "019f8500-0000-7000-8000-000000000001",
       "organization_id": "019f8500-0000-7000-8000-000000000101"}')),
  ('planted-on-accepting', pg_temp.raise('planning.assignment_created.v1', '019f8500-0000-7000-8000-000000000b02',
     '{"assignment_id": "019f8500-0000-7000-8000-000000000b02", "person_id": "019f8500-0000-7000-8000-000000000001",
       "relationship_id": "019f8500-0000-7000-8000-000000000701"}')),
  ('password', pg_temp.raise('identity.password_changed.v1', '019f8500-0000-7000-8000-000000000d01',
     '{"change_id": "019f8500-0000-7000-8000-000000000d01"}'));

select is(pg_temp.of('cancelled-herself'), '{}'::text[],
  'T-IDN-INT-72 the plan she ended herself is no notice');
select is(pg_temp.of('planted-on-accepting'), '{}'::text[],
  'T-IDN-INT-72 nor the program planted when she accepted an invitation');
select is(pg_temp.of('password'), '{}'::text[],
  'T-IDN-INT-72 nor, while ADR-054 rule 4 stands as written, the password she changed');

-- An event raised with no person acting still reaches her: the organization closed.
select set_config('app.actor_kind', 'worker', true);
select set_config('app.actor_person_id', '', true);
insert into raised values ('closed-gym', pg_temp.raise('payments.subscription_ended.v1', '019f8500-0000-7000-8000-000000000a04',
  '{"subscription_id": "019f8500-0000-7000-8000-000000000a04", "person_id": "019f8500-0000-7000-8000-000000000001",
    "organization_id": "019f8500-0000-7000-8000-000000000101"}'));
select is(array_length(pg_temp.of('closed-gym'), 1), 1,
  'T-IDN-INT-72 an event nobody in particular caused is still hers');

-- ———————————————————————————————— scenarios 5 and 7: channels and phones

select is(
  (select count(*)::integer from identity.person_notifications
   where person_id = '019f8500-0000-7000-8000-000000000001' and category = 'relationship'),
  8, 'T-IDN-INT-73 email off for her relationship removed none of its notices from her inbox');
select is(
  (select array_agg(distinct delivery.device_id::text) from system.notification_deliveries as delivery),
  array['a5000000-0000-4000-8000-000000000001'],
  'T-IDN-INT-74 push goes to the phone she uses, never to the one she signed out of');
select is(
  (select count(*)::integer from system.notification_deliveries where status = 'pending' and attempt_count = 0),
  (select count(*)::integer from identity.person_notifications
   where person_id = '019f8500-0000-7000-8000-000000000001' and category <> 'nutrition'),
  'T-IDN-INT-74 one pending push per notice and phone, born with the notice');
select is(
  (select count(*)::integer from system.notification_deliveries as delivery
   join identity.person_notifications as notice on notice.id = delivery.notification_id
   where notice.kind = 'goal_proposed'),
  0, 'T-IDN-INT-75 push off for nutrition: the goal is in her inbox and on no phone');
select is(
  (select count(*)::integer from identity.person_notifications where kind = 'goal_proposed'),
  1, 'T-IDN-INT-75 but it is in her inbox');

select throws_ok(
  $$ insert into system.notification_deliveries (notification_id, device_id)
     select notification_id, device_id from system.notification_deliveries limit 1 $$,
  '23505', null, 'T-IDN-PHY-36 a retry can never push one notice to one phone twice');
select throws_ok(
  $$ insert into identity.person_notifications (person_id, source_event_id, kind, category, subject_type, subject_id, occurred_at)
     select person_id, source_event_id, kind, category, subject_type, subject_id, occurred_at
     from identity.person_notifications limit 1 $$,
  '23505', null, 'T-IDN-PHY-36 nor one event become two notices for her');
select throws_ok(
  $$ insert into identity.person_notifications (person_id, source_event_id, kind, category, subject_type, subject_id, occurred_at)
     values ('019f8500-0000-7000-8000-000000000001', gen_random_uuid(), 'client_invitation', 'nutrition',
             'invitation', gen_random_uuid(), clock_timestamp()) $$,
  '23514', null, 'T-IDN-PHY-37 a kind keeps the category the map gives it');
select throws_ok(
  $$ insert into identity.person_notifications (person_id, source_event_id, kind, category, subject_type, subject_id, occurred_at)
     values ('019f8500-0000-7000-8000-000000000001', gen_random_uuid(), 'weight_logged', 'relationship',
             'invitation', gen_random_uuid(), clock_timestamp()) $$,
  '23514', null, 'T-IDN-PHY-37 and a kind outside the list does not exist');
select throws_ok(
  $$ update identity.person_notifications set kind = 'plan_ended' where kind = 'plan_paused' $$,
  '55000', null, 'T-IDN-PHY-38 a notice is never rewritten, whoever tries');
select throws_ok(
  $$ update system.notification_deliveries set status = 'sent' $$,
  '23514', null, 'T-IDN-PHY-38 and a push is not sent without saying when');

select is(
  (select count(*)::integer from identity.person_notifications where person_id = '019f8500-0000-7000-8000-000000000003'),
  0, 'T-IDN-INT-72 the coach who raised every event was told of none');

-- ———————————————————————————————— a phone she signs out of

update identity.person_push_devices set retired_at = clock_timestamp(), retired_reason = 'sign_out'
where id = 'a5000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from system.notification_deliveries where status = 'pending'), 0,
  'T-IDN-INT-76 a phone she signs out of keeps none of the pushes still waiting');
select is(
  (select count(*)::integer from system.notification_deliveries where status = 'skipped'),
  (select count(*)::integer from identity.person_notifications
   where person_id = '019f8500-0000-7000-8000-000000000001' and category <> 'nutrition'),
  'T-IDN-INT-76 they are skipped, and the notices stay in her inbox');

select * from finish();
rollback;
