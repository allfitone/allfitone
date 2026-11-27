-- T-IDN-NOTICES-02 — a person lists her notices and marks them read (`OP-IDN-074`,
-- `OP-IDN-075`, `HU-SP-091`, ADR-054). TECH-44.
--
-- «Awaits your decision» is read, not stored: a pending invitation, cover, correction or
-- goal awaits, and once decided or expired it stops awaiting without a second write
-- (scenario 4). The listing carries the names the sentence needs and nothing else
-- (scenario 3). Reading never decides anything. Only she reads or marks her notices, and
-- nobody, her included, reads the push deliveries (scenario 9).
--
-- Written before the migration and watched failing; the neighbour's denials were watched
-- succeeding with the policies replaced by `true`.
begin;

select plan(34);

set local session_replication_role = replica;

insert into identity.people (id, given_name, family_name, contact_email, contact_email_verified_at, status)
values ('019f8600-0000-7000-8000-000000000001', 'Ana', 'Cliente', 'ana.inbox@example.test', clock_timestamp(), 'active'),
       ('019f8600-0000-7000-8000-000000000002', 'Bea', 'Vecina', 'bea.inbox@example.test', clock_timestamp(), 'active'),
       ('019f8600-0000-7000-8000-000000000003', 'Camilo', 'Coach', null, null, 'active'),
       ('019f8600-0000-7000-8000-000000000004', 'Diana', 'Cover', null, null, 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id, linked_at)
values ('019f8600-0000-7000-8000-000000000301', 'workos', 'https://issuer.test', 'user_ana_inbox',
        '019f8600-0000-7000-8000-000000000001', clock_timestamp()),
       ('019f8600-0000-7000-8000-000000000302', 'workos', 'https://issuer.test', 'user_bea_inbox',
        '019f8600-0000-7000-8000-000000000002', clock_timestamp());

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019f8600-0000-7000-8000-000000000101', 'gym', 'Gym Sur',
  '{"party_kind":"legal_entity","party_name":"Gym Sur SAS","purpose":"studio_operations"}');
insert into organizations.organization_memberships (id, organization_id, person_id, status)
values ('019f8600-0000-7000-8000-000000000203', '019f8600-0000-7000-8000-000000000101', '019f8600-0000-7000-8000-000000000003', 'active'),
       ('019f8600-0000-7000-8000-000000000204', '019f8600-0000-7000-8000-000000000101', '019f8600-0000-7000-8000-000000000004', 'active');

insert into relationships.service_relationships (id, person_id, organization_id, status, started_at)
values ('019f8600-0000-7000-8000-000000000701', '019f8600-0000-7000-8000-000000000001',
        '019f8600-0000-7000-8000-000000000101', 'active', clock_timestamp() - interval '30 days');
insert into relationships.relationship_professional_assignments (
  id, relationship_id, person_id, organization_id, membership_id, covers_membership_id, kind, status, ends_on
) values ('019f8600-0000-7000-8000-000000000802', '019f8600-0000-7000-8000-000000000701', '019f8600-0000-7000-8000-000000000001',
          '019f8600-0000-7000-8000-000000000101', '019f8600-0000-7000-8000-000000000204', '019f8600-0000-7000-8000-000000000203', 'substitute', 'proposed', current_date + 10);

insert into identity.invitations (
  id, organization_id, issued_by_membership_id, channel, contact,
  token_hash, token_key_version, proposal_hash, responsible_party, status, expires_at
) values ('019f8600-0000-7000-8000-000000000401', '019f8600-0000-7000-8000-000000000101',
  '019f8600-0000-7000-8000-000000000203', 'email', 'ana.inbox@example.test',
  extensions.digest('i-token-1', 'sha256'), 1, extensions.digest('i-proposal-1', 'sha256'),
  '{"party_kind":"legal_entity","party_name":"Gym Sur SAS","purpose":"studio_operations"}',
  'pending', '2030-01-01 00:00:00+00');
insert into identity.invitation_intents (id, invitation_id, kind, status, proposed_role_code)
values ('019f8600-0000-7000-8000-000000000501', '019f8600-0000-7000-8000-000000000401', 'service_relationship', 'pending', null);

insert into execution.correction_proposals (
  id, person_id, relationship_id, organization_id, proposer_assignment_id, proposer_membership_id,
  executed_session_id, target_strength_set_id, set_order, target_field, current_value,
  proposed_value, reason, status, created_at, expires_at
) values ('019f8600-0000-7000-8000-000000000901', '019f8600-0000-7000-8000-000000000001',
  '019f8600-0000-7000-8000-000000000701', '019f8600-0000-7000-8000-000000000101',
  gen_random_uuid(), '019f8600-0000-7000-8000-000000000203',
  gen_random_uuid(), gen_random_uuid(), 1, 'achieved_reps', 8, 10, 'Contaste mal', 'pending',
  '2030-01-02 00:00:00+00', '2030-02-01 00:00:00+00');

insert into nutrition.goal_versions (
  id, goal_set_id, person_id, version_number, origin, status, rationale, author_person_id,
  author_membership_id, author_assignment_id, origin_relationship_id, origin_organization_id
) values ('019f8600-0000-7000-8000-000000000c01', gen_random_uuid(), '019f8600-0000-7000-8000-000000000001', 2,
        'professional', 'proposed', 'Más proteína', '019f8600-0000-7000-8000-000000000003',
        '019f8600-0000-7000-8000-000000000203', gen_random_uuid(), '019f8600-0000-7000-8000-000000000701',
        '019f8600-0000-7000-8000-000000000101');

insert into planning.programs (id, content_scope, owner_organization_id, author_person_id)
values ('019f8600-0000-7000-8000-000000000e01', 'organization', '019f8600-0000-7000-8000-000000000101',
        '019f8600-0000-7000-8000-000000000003');
insert into planning.program_versions (id, program_id, version_number, title, content_hash)
values ('019f8600-0000-7000-8000-000000000e02', '019f8600-0000-7000-8000-000000000e01', 1, 'Fuerza 12 semanas',
        extensions.digest('program', 'sha256'));
insert into planning.program_assignments (id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on, timezone, display_order)
values ('019f8600-0000-7000-8000-000000000b01', '019f8600-0000-7000-8000-000000000001', '019f8600-0000-7000-8000-000000000e02',
        '019f8600-0000-7000-8000-000000000701', 'active', current_date, 'America/Bogota', 1);

insert into identity.person_push_devices (id, person_id, platform, push_token)
values ('a6000000-0000-4000-8000-000000000001', '019f8600-0000-7000-8000-000000000001', 'ios', 'ExponentPushToken[ana-inbox]');

set local session_replication_role = origin;

create function pg_temp.raise(p_type text, p_aggregate uuid, p_payload jsonb) returns uuid
language sql as $fn$
  select system.enqueue_outbox_event(split_part(p_type, '.', 1), p_aggregate, p_type, p_payload)
$fn$;

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8600-0000-7000-8000-000000000003', true);

-- Oldest first, so the newest is the goal.
select pg_temp.raise('payments.subscription_suspended.v1', '019f8600-0000-7000-8000-000000000a01',
  '{"subscription_id": "019f8600-0000-7000-8000-000000000a01", "person_id": "019f8600-0000-7000-8000-000000000001",
    "organization_id": "019f8600-0000-7000-8000-000000000101"}');
select pg_temp.raise('payments.subscription_suspended.v1', '019f8600-0000-7000-8000-000000000a02',
  '{"subscription_id": "019f8600-0000-7000-8000-000000000a02", "person_id": "019f8600-0000-7000-8000-000000000002",
    "organization_id": "019f8600-0000-7000-8000-000000000101"}');
select pg_temp.raise('planning.assignment_created.v1', '019f8600-0000-7000-8000-000000000b01',
  '{"assignment_id": "019f8600-0000-7000-8000-000000000b01", "person_id": "019f8600-0000-7000-8000-000000000001",
    "relationship_id": "019f8600-0000-7000-8000-000000000701"}');
select pg_temp.raise('relationship.client_invited.v1', '019f8600-0000-7000-8000-000000000401',
  '{"invitation_id": "019f8600-0000-7000-8000-000000000401"}');
select pg_temp.raise('relationship.substitution_proposed.v1', '019f8600-0000-7000-8000-000000000701',
  '{"relationship_id": "019f8600-0000-7000-8000-000000000701", "organization_id": "019f8600-0000-7000-8000-000000000101",
    "person_id": "019f8600-0000-7000-8000-000000000001", "assignment_id": "019f8600-0000-7000-8000-000000000802"}');
select pg_temp.raise('execution.correction_proposed.v1', '019f8600-0000-7000-8000-000000000901',
  '{"proposal_id": "019f8600-0000-7000-8000-000000000901"}');
select pg_temp.raise('nutrition.goal_version_proposed.v1', '019f8600-0000-7000-8000-000000000c01',
  '{"goal_version_id": "019f8600-0000-7000-8000-000000000c01", "person_id": "019f8600-0000-7000-8000-000000000001",
    "relationship_id": "019f8600-0000-7000-8000-000000000701", "organization_id": "019f8600-0000-7000-8000-000000000101"}');

select set_config('app.actor_kind', '', true);
select set_config('app.actor_person_id', '', true);

create function pg_temp.list(p_filter text default 'all', p_limit integer default 30,
  p_before_at timestamptz default null, p_before_id uuid default null, p_subject text default 'user_ana_inbox')
returns jsonb language sql as $fn$
  select identity.list_my_notices('workos', 'https://issuer.test', p_subject, p_filter, p_limit, p_before_at, p_before_id)
$fn$;

create function pg_temp.item(p_page jsonb, p_kind text) returns jsonb
language sql as $fn$
  select item from jsonb_array_elements(p_page -> 'items') as item where item ->> 'kind' = p_kind
$fn$;

-- The test's own lookup, run as the test's role: the runtime role reads no notice.
create function pg_temp.notice_id(p_kind text, p_person uuid default '019f8600-0000-7000-8000-000000000001') returns uuid
language sql security definer as $fn$
  select id from identity.person_notifications where kind = p_kind and person_id = p_person
$fn$;

set local role allfit_api;

-- ———————————————————————————————— the listing (OP-IDN-074)

create temporary table first_page as select pg_temp.list() as page;

select is(
  (select array_agg(item ->> 'kind' order by ordinality) from first_page,
     jsonb_array_elements(page -> 'items') with ordinality as entries (item, ordinality)),
  array['goal_proposed', 'correction_proposed', 'cover_proposed', 'client_invitation', 'program_assigned', 'plan_paused'],
  'T-IDN-INT-77 she reads her six notices, newest first, and none of her neighbour''s');
select is((select page -> 'awaiting_count' from first_page), '4'::jsonb,
  'T-IDN-INT-77 four of them await her decision');
select is((select page -> 'unread_count' from first_page), '6'::jsonb, 'T-IDN-INT-77 and all six are unread');
select is((select page -> 'has_more' from first_page), 'false'::jsonb, 'T-IDN-INT-77 on one page');

select is(pg_temp.item((select page from first_page), 'client_invitation'),
  jsonb_build_object(
    'id', pg_temp.notice_id('client_invitation'), 'kind', 'client_invitation', 'category', 'relationship',
    'subject', jsonb_build_object('type', 'invitation', 'id', '019f8600-0000-7000-8000-000000000401'),
    'organization_id', '019f8600-0000-7000-8000-000000000101',
    'occurred_at', (pg_temp.item((select page from first_page), 'client_invitation') -> 'occurred_at'),
    'read_at', null, 'awaiting', true, 'expires_at', '2030-01-01T00:00:00+00:00',
    'names', jsonb_build_object('organization', 'Gym Sur', 'professional', 'Camilo Coach', 'program', null)),
  'T-IDN-INT-78 an invitation awaits until it expires, with the names its sentence needs and nothing else');
select is(pg_temp.item((select page from first_page), 'cover_proposed') -> 'names' ->> 'professional', 'Diana Cover',
  'T-IDN-INT-78 a cover names who covers');
select is(pg_temp.item((select page from first_page), 'cover_proposed') ->> 'expires_at',
  to_jsonb((current_date + 11)::timestamptz) #>> '{}',
  'T-IDN-INT-78 and stops being decidable the day after it ends');
select is(pg_temp.item((select page from first_page), 'correction_proposed') ->> 'expires_at',
  '2030-02-01T00:00:00+00:00', 'T-IDN-INT-78 a correction expires when the proposal does');
select is(pg_temp.item((select page from first_page), 'goal_proposed') -> 'names',
  '{"organization": "Gym Sur", "professional": "Camilo Coach", "program": null}'::jsonb,
  'T-IDN-INT-78 a goal names who proposed it');
select is(pg_temp.item((select page from first_page), 'goal_proposed') -> 'expires_at', 'null'::jsonb,
  'T-IDN-INT-78 and has no expiry of its own');
select is(pg_temp.item((select page from first_page), 'program_assigned') -> 'names' ->> 'program', 'Fuerza 12 semanas',
  'T-IDN-INT-78 an assigned program names the program');
select is(
  (select array[item ->> 'awaiting', item ->> 'expires_at'] from pg_temp.item((select page from first_page), 'plan_paused') as item),
  array['false', null], 'T-IDN-INT-78 a paused plan never awaits anything');

select is(
  (select array_agg(item ->> 'kind' order by ordinality) from jsonb_array_elements(pg_temp.list('awaiting') -> 'items')
     with ordinality as entries (item, ordinality)),
  array['goal_proposed', 'correction_proposed', 'cover_proposed', 'client_invitation'],
  'T-IDN-INT-79 the awaiting filter keeps only what waits on her');
select throws_ok($$ select pg_temp.list('urgent') $$, '22023', null, 'T-IDN-INT-79 an unknown filter is refused');
select throws_ok($$ select pg_temp.list('all', 0) $$, '22023', null, 'T-IDN-INT-79 and so is an empty page');

create temporary table paged as select pg_temp.list('all', 2) as page;
select is((select page -> 'has_more' from paged), 'true'::jsonb, 'T-IDN-INT-80 a short page says there is more');
select is(
  (select array_agg(item ->> 'kind' order by ordinality) from jsonb_array_elements(
     pg_temp.list('all', 2,
       ((select page -> 'items' -> 1 ->> 'occurred_at' from paged))::timestamptz,
       ((select page -> 'items' -> 1 ->> 'id' from paged))::uuid) -> 'items') with ordinality as entries (item, ordinality)),
  array['cover_proposed', 'client_invitation'],
  'T-IDN-INT-80 and the next one continues after the last notice read');

-- ———————————————————————————————— reading (OP-IDN-075)

create temporary table first_read as
select identity.mark_my_notice_read('workos', 'https://issuer.test', 'user_ana_inbox', pg_temp.notice_id('client_invitation')) as notice;
select isnt((select notice ->> 'read_at' from first_read), null, 'T-IDN-INT-81 opening a notice marks it read');
select is(
  identity.mark_my_notice_read('workos', 'https://issuer.test', 'user_ana_inbox', pg_temp.notice_id('client_invitation')) ->> 'read_at',
  (select notice ->> 'read_at' from first_read), 'T-IDN-IDEM-27 reading it again answers the same and moves nothing');
select is((select notice -> 'awaiting' from first_read), 'true'::jsonb,
  'T-IDN-INT-81 reading decides nothing: the invitation still awaits');
select is(pg_temp.list() -> 'unread_count', '5'::jsonb, 'T-IDN-INT-81 and one fewer is unread');

select throws_ok(
  format($$ select identity.mark_my_notice_read('workos', 'https://issuer.test', 'user_bea_inbox', %L) $$,
    pg_temp.notice_id('client_invitation')),
  'P0002', null, 'T-IDN-RLS-41 her neighbour cannot mark her notice, and is told it does not exist');
select throws_ok(
  $$ select identity.mark_my_notice_read('workos', 'https://issuer.test', 'user_ana_inbox', gen_random_uuid()) $$,
  'P0002', null, 'T-IDN-RLS-41 as for one that does not exist');
select is(
  (select array_agg(item ->> 'kind') from jsonb_array_elements(pg_temp.list('all', 30, null, null, 'user_bea_inbox') -> 'items') as item),
  array['plan_paused'], 'T-IDN-RLS-41 and lists only her own');

-- ———————————————————————————————— decided anywhere, it stops awaiting (scenario 4)

reset role;
-- Decided elsewhere, by hand: the fixtures' subjects point at rows this test never made.
set local session_replication_role = replica;
update identity.invitations set status = 'completed' where id = '019f8600-0000-7000-8000-000000000401';
update relationships.relationship_professional_assignments set status = 'rejected' where id = '019f8600-0000-7000-8000-000000000802';
update nutrition.goal_versions set status = 'active' where id = '019f8600-0000-7000-8000-000000000c01';
update execution.correction_proposals
set created_at = now() - interval '31 days', expires_at = now() - interval '1 day'
where id = '019f8600-0000-7000-8000-000000000901';
set local session_replication_role = origin;

set local role allfit_api;
create temporary table decided as select pg_temp.list() as page;
select is((select page -> 'awaiting_count' from decided), '0'::jsonb,
  'T-IDN-INT-82 accepted, rejected, activated or expired, nothing awaits her any more');
select is(
  (select count(*)::integer from jsonb_array_elements((select page -> 'items' from decided)) as item
   where item -> 'expires_at' <> 'null'::jsonb),
  0, 'T-IDN-INT-82 and no expiry is shown for what no longer waits');
select is(jsonb_array_length(pg_temp.list('awaiting') -> 'items'), 0,
  'T-IDN-INT-82 without anything written to the notices themselves');

-- ———————————————————————————————— straight at the tables

select throws_ok($$ select count(*) from identity.person_notifications $$,
  '42501', null, 'T-IDN-RLS-42 the runtime role cannot read the notices');
select throws_ok($$ select count(*) from system.notification_deliveries $$,
  '42501', null, 'T-IDN-RLS-42 nor the deliveries');

set local role allfit_owner;
select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f8600-0000-7000-8000-000000000002', true);

select is((select count(*)::integer from identity.person_notifications), 1,
  'T-IDN-RLS-43 straight at the table, the neighbour sees her one notice and none of Ana''s');
update identity.person_notifications set read_at = clock_timestamp()
where person_id = '019f8600-0000-7000-8000-000000000001';
select throws_ok(
  $$ insert into identity.person_notifications (person_id, source_event_id, kind, category, subject_type, subject_id, occurred_at)
     values ('019f8600-0000-7000-8000-000000000001', gen_random_uuid(), 'plan_ended', 'relationship',
             'plan_subscription', gen_random_uuid(), clock_timestamp()) $$,
  '42501', null, 'T-IDN-RLS-43 and cannot write one in Ana''s name: only the event does');

select set_config('app.actor_person_id', '019f8600-0000-7000-8000-000000000001', true);
select is((select count(*)::integer from identity.person_notifications where read_at is not null), 1,
  'T-IDN-RLS-43 Ana sees hers, and the neighbour''s update read none of them');
select is((select count(*)::integer from system.notification_deliveries), 0,
  'T-IDN-RLS-44 no person reads the push deliveries, not even of her own notices');
reset role;
select is((select count(*)::integer from system.notification_deliveries), 6,
  'T-IDN-RLS-44 though her phone has one for each of them');

select * from finish();
rollback;
