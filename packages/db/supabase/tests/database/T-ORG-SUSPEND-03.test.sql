-- T-ORG-SUSPEND-03 — a suspended gym invites nobody and takes no new subscription
-- (`HU-BO-016` c2).
--
-- `20261018130000` relied on a dozen functions already asking `status = 'active'` before
-- inviting, publishing or charging, and asserted none of them for a suspended gym. These
-- are the two a person meets: the owner inviting a client, and a client subscribing to
-- the gym's published plan. Each is shown working while the gym operates, so the refusal
-- after the suspension is the suspension's and not a broken fixture.

begin;

select plan(4);

insert into identity.people (id, given_name, family_name, status, contact_email)
values
  ('019bc000-0000-7000-8000-000000000001', 'Olivia', 'Owner', 'active', null),
  ('019bc000-0000-7000-8000-000000000002', 'Carla', 'Cliente', 'active', 'carla@example.test'),
  ('019bc000-0000-7000-8000-000000000005', 'Dora', 'Cliente', 'active', 'dora@example.test');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values ('019bc000-0000-7000-8000-000000000101', 'gym', 'Gimnasio Pausado',
  '{"party_kind":"legal_entity","party_name":"Pausado SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values ('019bc000-0000-7000-8000-000000000201', '019bc000-0000-7000-8000-000000000101',
  '019bc000-0000-7000-8000-000000000001', 'active');
insert into organizations.membership_roles (membership_id, role_code)
values ('019bc000-0000-7000-8000-000000000201', 'owner');

insert into payments.gateway_connections (id, organization_id, provider, status)
values ('019bc000-0000-7000-8000-000000000301', '019bc000-0000-7000-8000-000000000101',
  'mercado_pago', 'active');
insert into payments.organization_plans (id, organization_id, name, status)
values ('019bc000-0000-7000-8000-000000000401', '019bc000-0000-7000-8000-000000000101',
  'Mensual', 'published');
insert into payments.plan_versions
  (id, plan_id, organization_id, version_number, amount_minor, currency_code,
   billing_period, status, published_at, deprecated_at)
values ('019bc000-0000-7000-8000-000000000501', '019bc000-0000-7000-8000-000000000401',
  '019bc000-0000-7000-8000-000000000101', 1, 12000000, 'COP', 'month', 'published',
  clock_timestamp(), null);

insert into relationships.service_relationships (id, person_id, organization_id, status)
values
  ('019bc000-0000-7000-8000-000000000701', '019bc000-0000-7000-8000-000000000002',
   '019bc000-0000-7000-8000-000000000101', 'active'),
  ('019bc000-0000-7000-8000-000000000702', '019bc000-0000-7000-8000-000000000005',
   '019bc000-0000-7000-8000-000000000101', 'active');

insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
values ('019bc000-0000-7000-8000-000000000a01', 'relationship_training', 1, 'draft',
  null);

-- IX-06: offering contribute needs a published contribute rule, as the real
-- relationship_training has. A rule is written while its version is a draft.
insert into privacy.scope_resource_rules (
  scope_definition_id, resource, field, data_classification_code, max_action
) values ('019bc000-0000-7000-8000-000000000a01', 'planning.program_assignments', '*', 'training', 'contribute');
update privacy.scope_definitions
   set status = 'published', published_at = clock_timestamp()
 where id = '019bc000-0000-7000-8000-000000000a01';

create function pg_temp.as_person(person_number integer)
returns void language sql as $$
  select set_config('app.actor_kind', 'person', true),
         set_config('app.actor_person_id',
           '019bc000-0000-7000-8000-' || lpad(person_number::text, 12, '0'), true),
         set_config('app.request_id', gen_random_uuid()::text, true);
$$;

create function pg_temp.invite(contact text, command_number integer)
returns table(invitation_id uuid)
language sql as $$
  select invitation_id from identity.issue_client_invitation(
    access_control.person(), '019bc000-0000-7000-8000-000000000101'::uuid,
    'email', contact,
    '[{"scope_code":"relationship_training","access_level":"contribute","purpose":"Entrenar",
       "presented_snapshot":{"title":"Entrenamiento"}}]'::jsonb,
    extensions.digest(contact, 'sha256'), 1::smallint,
    ('019bc000-0000-4000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019bc000-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    extensions.digest('invite' || contact, 'sha256'));
$$;

create function pg_temp.subscribe(person_number integer, command_number integer)
returns table(started boolean)
language sql as $$
  select started from payments.subscribe_to_plan(
    ('019bc000-0000-7000-8000-' || lpad(person_number::text, 12, '0'))::uuid,
    '019bc000-0000-7000-8000-000000000501'::uuid,
    ('019bc000-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    ('019bc000-0000-7000-8000-' || lpad(command_number::text, 12, '0'))::uuid,
    extensions.digest('subscribe' || person_number, 'sha256'));
$$;

-- While the gym operates, both work.
set local role allfit_api;
select pg_temp.as_person(1);
select lives_ok($$select * from pg_temp.invite('ana@example.test', 901)$$,
  'an operating gym invites a client');
select pg_temp.as_person(2);
select lives_ok($$select * from pg_temp.subscribe(2, 1001)$$,
  'and a client subscribes to its published plan');
reset role;

update organizations.organizations
set status = 'suspended', suspended_at = clock_timestamp()
where id = '019bc000-0000-7000-8000-000000000101';

set local role allfit_api;
select pg_temp.as_person(1);
select throws_ok($$select * from pg_temp.invite('bea@example.test', 902)$$,
  'P0002', null,
  'a suspended gym invites nobody: its owner acts for no operating gym');
select pg_temp.as_person(5);
select throws_ok($$select * from pg_temp.subscribe(5, 1002)$$,
  'P0002', null,
  'and takes no new subscription, answering as if there were no plan to offer');
reset role;

select * from finish();

rollback;
