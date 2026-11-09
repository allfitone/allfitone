-- T-PAY-GYM-PLAN-02 — `OP-PAY-004`, `OP-PAY-005`, and what `OP-PAY-011`/`OP-PAY-012` offer:
-- a gym prices its plans, changes the price, takes a plan off sale (`HU-STUDIO-075`,
-- `HU-STUDIO-076`, `ADR-048`).
--
-- **One price on sale per plan.** Publishing a version retires the one before it in the
-- same transaction, and a unique index holds that even against a direct insert. Whoever
-- subscribed to the old price keeps it: a version never moves and neither does she.
--
-- **Pesos, whole.** Mercado Pago Colombia charges in COP, so nothing else is accepted, and
-- nobody prices a gym in centavos.
--
-- **Space offers only what is paid in person.** A remote plan is paid through the link
-- the gym sends (`HU-STUDIO-088`); the app neither lists it nor subscribes to it.

begin;

select plan(39);

-- ---------------------------------------------------------------------------
-- A gym that can be paid, its team, two clients, and a gym next door
-- ---------------------------------------------------------------------------

insert into identity.people (id, given_name, family_name, status, contact_email)
values
  ('019c3200-0000-7000-8000-000000000001', 'Olivia', 'Owner', 'active', null),
  ('019c3200-0000-7000-8000-000000000003', 'Cesar', 'Coach', 'active', null),
  ('019c3200-0000-7000-8000-000000000004', 'Sofia', 'Staff', 'active', null),
  ('019c3200-0000-7000-8000-000000000005', 'Otra', 'Owner', 'active', null),
  ('019c3200-0000-7000-8000-000000000006', 'Carla', 'Cliente', 'active', 'carla@example.test'),
  ('019c3200-0000-7000-8000-000000000008', 'Dora', 'Cliente', 'active', 'dora@example.test');

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019c3200-0000-7000-8000-000000000101', 'gym', 'Gimnasio Uno',
   '{"party_kind":"legal_entity","party_name":"Uno SAS","purpose":"studio_operations"}'),
  ('019c3200-0000-7000-8000-000000000102', 'gym', 'Gimnasio Dos',
   '{"party_kind":"legal_entity","party_name":"Dos SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019c3200-0000-7000-8000-000000000201', '019c3200-0000-7000-8000-000000000101',
   '019c3200-0000-7000-8000-000000000001', 'active'),
  ('019c3200-0000-7000-8000-000000000203', '019c3200-0000-7000-8000-000000000101',
   '019c3200-0000-7000-8000-000000000003', 'active'),
  ('019c3200-0000-7000-8000-000000000204', '019c3200-0000-7000-8000-000000000101',
   '019c3200-0000-7000-8000-000000000004', 'active'),
  ('019c3200-0000-7000-8000-000000000205', '019c3200-0000-7000-8000-000000000102',
   '019c3200-0000-7000-8000-000000000005', 'active'),
  ('019c3200-0000-7000-8000-000000000206', '019c3200-0000-7000-8000-000000000102',
   '019c3200-0000-7000-8000-000000000001', 'active');

-- Olivia also administers the gym next door, so its rows are visible to her: only each
-- function's own organization check keeps a path through Gimnasio Uno from reaching them.
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019c3200-0000-7000-8000-000000000201', 'owner'),
  ('019c3200-0000-7000-8000-000000000203', 'coach'),
  ('019c3200-0000-7000-8000-000000000204', 'staff'),
  ('019c3200-0000-7000-8000-000000000205', 'owner'),
  ('019c3200-0000-7000-8000-000000000206', 'admin');

insert into relationships.service_relationships (id, person_id, organization_id, status)
values
  ('019c3200-0000-7000-8000-000000000701', '019c3200-0000-7000-8000-000000000006',
   '019c3200-0000-7000-8000-000000000101', 'active'),
  ('019c3200-0000-7000-8000-000000000702', '019c3200-0000-7000-8000-000000000008',
   '019c3200-0000-7000-8000-000000000101', 'active');

insert into payments.gateway_connections (id, organization_id, provider, status)
values ('019c3200-0000-7000-8000-000000000301', '019c3200-0000-7000-8000-000000000101',
  'mercado_pago', 'active');

insert into payments.organization_plans (id, organization_id, name, status)
values
  ('019c3200-0000-7000-8000-000000000401', '019c3200-0000-7000-8000-000000000101',
   'Mensual', 'draft'),
  ('019c3200-0000-7000-8000-000000000402', '019c3200-0000-7000-8000-000000000101',
   'Online', 'draft'),
  ('019c3200-0000-7000-8000-000000000403', '019c3200-0000-7000-8000-000000000102',
   'Dos', 'published');

insert into payments.plan_versions
  (id, plan_id, organization_id, version_number, amount_minor, currency_code,
   billing_period, status, published_at)
values ('019c3200-0000-7000-8000-000000000503', '019c3200-0000-7000-8000-000000000403',
  '019c3200-0000-7000-8000-000000000102', 1, 9000000, 'COP', 'month', 'published',
  clock_timestamp());

set local role allfit_owner;

select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000001', true),
       set_config('app.request_id', gen_random_uuid()::text, true);

-- ---------------------------------------------------------------------------
-- The first price — `OP-PAY-004`
-- ---------------------------------------------------------------------------

create temporary table first_price on commit drop as
select result, created, replayed from payments.publish_plan_version(
  '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
  '019c3200-0000-7000-8000-000000000401', 12000000, 'COP', 'month', 'in_person',
  '019c3200-0000-7000-8000-00000000c001', '019c3200-0000-7000-8000-00000000c001',
  extensions.digest('publish-v1', 'sha256'));

select is(
  (select result->'current_version'->>'version_number' || ':' || created::text
     from first_price),
  '1:true',
  'the owner publishes the first version of a plan'
);

select is(
  (select result->>'status' || ':' || (result->>'on_sale') from first_price),
  'published:true',
  'and the draft becomes a plan on sale'
);

select is(
  (select created::text || ':' || replayed::text
     from payments.publish_plan_version(
       '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
       '019c3200-0000-7000-8000-000000000401', 12000000, 'COP', 'month', 'in_person',
       '019c3200-0000-7000-8000-00000000c001', '019c3200-0000-7000-8000-00000000c001',
       extensions.digest('publish-v1', 'sha256'))),
  'true:true',
  'the same command repeated is a replay, and still says it created the version'
);

select is(
  (select created::text || ':' || replayed::text
     from payments.publish_plan_version(
       '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
       '019c3200-0000-7000-8000-000000000401', 12000000, 'COP', 'month', 'in_person',
       '019c3200-0000-7000-8000-00000000c002', '019c3200-0000-7000-8000-00000000c002',
       extensions.digest('publish-v1-again', 'sha256'))),
  'false:false',
  'and publishing the price already on sale, under a new key, changes nothing'
);

select is(
  (select created::text || ':' || replayed::text
     from payments.publish_plan_version(
       '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
       '019c3200-0000-7000-8000-000000000401', 12000000, 'COP', 'month', 'in_person',
       '019c3200-0000-7000-8000-00000000c002', '019c3200-0000-7000-8000-00000000c002',
       extensions.digest('publish-v1-again', 'sha256'))),
  'false:true',
  'whose replay keeps saying it created nothing'
);

select is(
  (select count(*)::integer from payments.plan_versions
    where plan_id = '019c3200-0000-7000-8000-000000000401'),
  1,
  'so there is still one version'
);

-- ---------------------------------------------------------------------------
-- Carla subscribes, then the price goes up
-- ---------------------------------------------------------------------------

select set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000006', true);

select is(
  (select started from payments.subscribe_to_plan(
    '019c3200-0000-7000-8000-000000000006',
    (select (result->'current_version'->>'plan_version_id')::uuid from first_price),
    '019c3200-0000-7000-8000-00000000d001', '019c3200-0000-7000-8000-00000000d001',
    extensions.digest('subscribe-carla', 'sha256'))),
  true,
  'a client subscribes to the price on sale'
);

select set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000001', true);

create temporary table second_price on commit drop as
select result, created from payments.publish_plan_version(
  '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
  '019c3200-0000-7000-8000-000000000401', 15000000, 'COP', 'month', 'in_person',
  '019c3200-0000-7000-8000-00000000c003', '019c3200-0000-7000-8000-00000000c003',
  extensions.digest('publish-v2', 'sha256'));

select is(
  (select result->'current_version'->>'version_number' || ':' ||
          (result->'current_version'->>'amount_minor')
     from second_price),
  '2:15000000',
  'a new price is version two'
);

select is(
  (select status::text || ':' || (deprecated_at is not null)::text
     from payments.plan_versions
    where id = (select (result->'current_version'->>'plan_version_id')::uuid
                  from first_price)),
  'deprecated:true',
  'and the old price is retired in the same command'
);

select is(
  (select count(*)::integer from payments.plan_versions
    where plan_id = '019c3200-0000-7000-8000-000000000401' and status = 'published'),
  1,
  'so one price is on sale'
);

select is(
  (select plan_version_id from payments.plan_subscriptions
    where person_id = '019c3200-0000-7000-8000-000000000006'),
  (select (result->'current_version'->>'plan_version_id')::uuid from first_price),
  'and Carla keeps the price she agreed to'
);

create temporary table yearly_price on commit drop as
select result from payments.publish_plan_version(
  '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
  '019c3200-0000-7000-8000-000000000401', 150000000, 'COP', 'year', 'in_person',
  '019c3200-0000-7000-8000-00000000c004', '019c3200-0000-7000-8000-00000000c004',
  extensions.digest('publish-v3', 'sha256'));

select is(
  (select result->'current_version'->>'version_number' || ':' ||
          (result->'current_version'->>'billing_period') || ':' ||
          jsonb_array_length(result->'versions')::text
     from yearly_price),
  '3:year:3',
  'versions count up, and the plan shows every one of them'
);

-- ---------------------------------------------------------------------------
-- What a price may be
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select * from payments.publish_plan_version(
      '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000401', 12000000, 'USD', 'month', 'in_person',
      '019c3200-0000-7000-8000-00000000c010', '019c3200-0000-7000-8000-00000000c010',
      extensions.digest('publish-usd', 'sha256'))$$,
  '22023', null,
  'a price in dollars is refused: Mercado Pago Colombia charges in pesos'
);

select throws_ok(
  $$select * from payments.publish_plan_version(
      '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000401', 1234550, 'COP', 'month', 'in_person',
      '019c3200-0000-7000-8000-00000000c011', '019c3200-0000-7000-8000-00000000c011',
      extensions.digest('publish-centavos', 'sha256'))$$,
  '22023', null,
  'and so is a price with centavos'
);

select throws_ok(
  $$select * from payments.publish_plan_version(
      '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000401', 0, 'COP', 'month', 'in_person',
      '019c3200-0000-7000-8000-00000000c012', '019c3200-0000-7000-8000-00000000c012',
      extensions.digest('publish-zero', 'sha256'))$$,
  '22023', null,
  'a gym plan charges something'
);

select throws_ok(
  $$select * from payments.publish_plan_version(
      '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000401', 100000000100, 'COP', 'month', 'in_person',
      '019c3200-0000-7000-8000-00000000c013', '019c3200-0000-7000-8000-00000000c013',
      extensions.digest('publish-huge', 'sha256'))$$,
  '22023', null,
  'and nothing past the cap'
);

select throws_ok(
  $$select * from payments.publish_plan_version(
      '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000401', 12000000, 'COP', 'fortnight', 'in_person',
      '019c3200-0000-7000-8000-00000000c014', '019c3200-0000-7000-8000-00000000c014',
      extensions.digest('publish-fortnight', 'sha256'))$$,
  '22023', null,
  'it is charged monthly or yearly, nothing else'
);

select throws_ok(
  $$select * from payments.publish_plan_version(
      '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000401', 12000000, 'COP', 'month', 'online',
      '019c3200-0000-7000-8000-00000000c015', '019c3200-0000-7000-8000-00000000c015',
      extensions.digest('publish-online', 'sha256'))$$,
  '22023', null,
  'and it is in person or remote, nothing else'
);

select throws_ok(
  $$select * from payments.publish_plan_version(
      '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000403', 12000000, 'COP', 'month', 'in_person',
      '019c3200-0000-7000-8000-00000000c016', '019c3200-0000-7000-8000-00000000c016',
      extensions.digest('publish-foreign', 'sha256'))$$,
  'P0002', 'plan not found',
  'a plan of another gym does not exist from here, even for an admin of both'
);

select set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000003', true);

select throws_ok(
  $$select * from payments.publish_plan_version(
      '019c3200-0000-7000-8000-000000000003', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000401', 9000000, 'COP', 'month', 'in_person',
      '019c3200-0000-7000-8000-00000000c017', '019c3200-0000-7000-8000-00000000c017',
      extensions.digest('publish-coach', 'sha256'))$$,
  '42501', null,
  'a coach does not set prices'
);

select set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000004', true);

select throws_ok(
  $$select * from payments.publish_plan_version(
      '019c3200-0000-7000-8000-000000000004', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000401', 9000000, 'COP', 'month', 'in_person',
      '019c3200-0000-7000-8000-00000000c018', '019c3200-0000-7000-8000-00000000c018',
      extensions.digest('publish-staff', 'sha256'))$$,
  '42501', null,
  'nor does staff'
);

-- ---------------------------------------------------------------------------
-- The table holds it too
-- ---------------------------------------------------------------------------

reset role;

select throws_ok(
  $$insert into payments.plan_versions
      (plan_id, organization_id, version_number, amount_minor, currency_code, billing_period)
    values ('019c3200-0000-7000-8000-000000000401', '019c3200-0000-7000-8000-000000000101',
            9, 9000000, 'COP', 'month')$$,
  '23505', null,
  'a second price on sale for one plan cannot be written even around the function'
);

select throws_ok(
  $$update payments.plan_versions set delivery_mode = 'remote'
     where id = '019c3200-0000-7000-8000-000000000503'$$,
  '55000', null,
  'and how a published version is delivered never changes'
);

set local role allfit_owner;

select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000001', true),
       set_config('app.request_id', gen_random_uuid()::text, true);

-- ---------------------------------------------------------------------------
-- A remote plan, and what Space offers
-- ---------------------------------------------------------------------------

create temporary table remote_price on commit drop as
select result from payments.publish_plan_version(
  '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
  '019c3200-0000-7000-8000-000000000402', 8000000, 'COP', 'month', 'remote',
  '019c3200-0000-7000-8000-00000000c020', '019c3200-0000-7000-8000-00000000c020',
  extensions.digest('publish-remote', 'sha256'));

select is(
  (select result->'current_version'->>'delivery_mode' from remote_price),
  'remote',
  'a plan followed at a distance is published as remote'
);

select set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000008', true);

select is(
  (select array_agg(plan_name order by plan_name)
     from payments.list_organization_plans(
       '019c3200-0000-7000-8000-000000000008', '019c3200-0000-7000-8000-000000000101',
       50, null, null)),
  array['Mensual'],
  'Space offers the plan paid in person and not the remote one'
);

select throws_ok(
  $$select * from payments.subscribe_to_plan(
      '019c3200-0000-7000-8000-000000000008',
      (select (result->'current_version'->>'plan_version_id')::uuid from remote_price),
      '019c3200-0000-7000-8000-00000000d002', '019c3200-0000-7000-8000-00000000d002',
      extensions.digest('subscribe-remote', 'sha256'))$$,
  'P0002', 'plan version not found',
  'and the app cannot subscribe to a remote plan, which is paid through the gym''s link'
);

-- ---------------------------------------------------------------------------
-- Taking a plan off sale — `OP-PAY-005`
-- ---------------------------------------------------------------------------

select set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000001', true);

create temporary table retired on commit drop as
select result, replayed from payments.deprecate_plan_version(
  '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
  '019c3200-0000-7000-8000-000000000401',
  (select (result->'current_version'->>'plan_version_id')::uuid from yearly_price),
  '019c3200-0000-7000-8000-00000000e001', '019c3200-0000-7000-8000-00000000e001',
  extensions.digest('retire-v3', 'sha256'));

select is(
  (select (result->>'on_sale') || ':' || (result->'current_version')::text from retired),
  'false:null',
  'retiring the price on sale takes the plan off sale'
);

select is(
  (select status::text || ':' || plan_version_id::text from payments.plan_subscriptions
    where person_id = '019c3200-0000-7000-8000-000000000006'),
  'active:' || (select result->'current_version'->>'plan_version_id' from first_price),
  'and Carla keeps paying what she agreed to, untouched'
);

select is(
  (select replayed::text || ':' || (result->>'on_sale')
     from payments.deprecate_plan_version(
       '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
       '019c3200-0000-7000-8000-000000000401',
       (select (result->'current_version'->>'plan_version_id')::uuid from yearly_price),
       '019c3200-0000-7000-8000-00000000e002', '019c3200-0000-7000-8000-00000000e002',
       extensions.digest('retire-v3-again', 'sha256'))),
  'false:false',
  'retiring it again is not an error and changes nothing'
);

select lives_ok(
  $$select * from payments.deprecate_plan_version(
      '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000401',
      (select (result->'current_version'->>'plan_version_id')::uuid from first_price),
      '019c3200-0000-7000-8000-00000000e003', '019c3200-0000-7000-8000-00000000e003',
      extensions.digest('retire-v1', 'sha256'))$$,
  'nor is retiring a price that a newer one already replaced'
);

select throws_ok(
  $$select * from payments.deprecate_plan_version(
      '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000403', '019c3200-0000-7000-8000-000000000503',
      '019c3200-0000-7000-8000-00000000e004', '019c3200-0000-7000-8000-00000000e004',
      extensions.digest('retire-foreign', 'sha256'))$$,
  'P0002', 'plan version not found',
  'a version of another gym does not exist from here, even for an admin of both'
);

select throws_ok(
  $$select * from payments.deprecate_plan_version(
      '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000401',
      (select (result->'current_version'->>'plan_version_id')::uuid from remote_price),
      '019c3200-0000-7000-8000-00000000e005', '019c3200-0000-7000-8000-00000000e005',
      extensions.digest('retire-wrong-plan', 'sha256'))$$,
  'P0002', 'plan version not found',
  'nor does a version named under a plan it does not belong to'
);

select is(
  (select (plan->>'on_sale') from payments.list_organization_plans_for_team(
     '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
     50, null, null, null)
    where plan_id = '019c3200-0000-7000-8000-000000000402'),
  'true',
  'which is why the remote plan is still on sale'
);

select set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000003', true);

select throws_ok(
  $$select * from payments.deprecate_plan_version(
      '019c3200-0000-7000-8000-000000000003', '019c3200-0000-7000-8000-000000000101',
      '019c3200-0000-7000-8000-000000000402',
      (select (result->'current_version'->>'plan_version_id')::uuid from remote_price),
      '019c3200-0000-7000-8000-00000000e006', '019c3200-0000-7000-8000-00000000e006',
      extensions.digest('retire-coach', 'sha256'))$$,
  '42501', null,
  'a coach takes nothing off sale'
);

select set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000008', true);

select is(
  (select count(*)::integer from payments.list_organization_plans(
     '019c3200-0000-7000-8000-000000000008', '019c3200-0000-7000-8000-000000000101',
     50, null, null)),
  0,
  'with the in-person plan off sale, Space offers nothing'
);

select throws_ok(
  $$select * from payments.subscribe_to_plan(
      '019c3200-0000-7000-8000-000000000008',
      (select (result->'current_version'->>'plan_version_id')::uuid from yearly_price),
      '019c3200-0000-7000-8000-00000000d003', '019c3200-0000-7000-8000-00000000d003',
      extensions.digest('subscribe-retired', 'sha256'))$$,
  'P0002', 'plan version not found',
  'and a retired price cannot be subscribed to'
);

-- ---------------------------------------------------------------------------
-- Back on sale
-- ---------------------------------------------------------------------------

select set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000001', true);

create temporary table fourth_price on commit drop as
select result from payments.publish_plan_version(
  '019c3200-0000-7000-8000-000000000001', '019c3200-0000-7000-8000-000000000101',
  '019c3200-0000-7000-8000-000000000401', 15000000, 'COP', 'month', 'in_person',
  '019c3200-0000-7000-8000-00000000c030', '019c3200-0000-7000-8000-00000000c030',
  extensions.digest('publish-v4', 'sha256'));

select is(
  (select result->'current_version'->>'version_number' || ':' || (result->>'on_sale')
     from fourth_price),
  '4:true',
  'publishing again puts the plan back on sale, as version four'
);

select set_config('app.actor_person_id', '019c3200-0000-7000-8000-000000000008', true);

select is(
  (select started from payments.subscribe_to_plan(
    '019c3200-0000-7000-8000-000000000008',
    (select (result->'current_version'->>'plan_version_id')::uuid from fourth_price),
    '019c3200-0000-7000-8000-00000000d004', '019c3200-0000-7000-8000-00000000d004',
    extensions.digest('subscribe-dora', 'sha256'))),
  true,
  'and the other client subscribes to it'
);

reset role;

select ok(
  has_function_privilege('allfit_api',
    'payments.publish_plan_version(uuid, uuid, uuid, bigint, text, text, text, uuid, uuid, bytea)',
    'execute')
  and has_function_privilege('allfit_api',
    'payments.deprecate_plan_version(uuid, uuid, uuid, uuid, uuid, uuid, bytea)', 'execute'),
  'the API calls both commands'
);

select * from finish();

rollback;
