-- T-PAY-GYM-PLAN-01 — `OP-PAY-002`, `OP-PAY-003`, `OP-PAY-006`: a gym names its plans and
-- its team reads them (`HU-STUDIO-074`, `HU-STUDIO-077`).
--
-- **A plan has a name before it has a price.** Creating one makes a draft, and the price
-- arrives with the first published version (`T-PAY-GYM-PLAN-02`).
--
-- **Only billing writes.** The owner and the admin hold `manage_billing`; a coach and a
-- staff member read the plans and change nothing. A price is nobody's personal data, so
-- the whole team may read it, and a refusal says forbidden rather than not found.
--
-- **A name is unique in its gym, ignoring case.** A published plan can be renamed too,
-- which was the owner's decision: subscribers see the new name.

begin;

select plan(38);

-- ---------------------------------------------------------------------------
-- A gym with its four roles, a client, an outsider, and a gym next door
-- ---------------------------------------------------------------------------

insert into identity.people (id, given_name, family_name, status, contact_email)
values
  ('019c3100-0000-7000-8000-000000000001', 'Olivia', 'Owner', 'active', null),
  ('019c3100-0000-7000-8000-000000000002', 'Adela', 'Admin', 'active', null),
  ('019c3100-0000-7000-8000-000000000003', 'Cesar', 'Coach', 'active', null),
  ('019c3100-0000-7000-8000-000000000004', 'Sofia', 'Staff', 'active', null),
  ('019c3100-0000-7000-8000-000000000005', 'Otra', 'Owner', 'active', null),
  ('019c3100-0000-7000-8000-000000000006', 'Carla', 'Cliente', 'active', 'carla@example.test'),
  ('019c3100-0000-7000-8000-000000000007', 'Nadia', 'Nadie', 'active', null);

insert into organizations.organizations (id, type_code, display_name, responsible_party)
values
  ('019c3100-0000-7000-8000-000000000101', 'gym', 'Gimnasio Uno',
   '{"party_kind":"legal_entity","party_name":"Uno SAS","purpose":"studio_operations"}'),
  ('019c3100-0000-7000-8000-000000000102', 'gym', 'Gimnasio Dos',
   '{"party_kind":"legal_entity","party_name":"Dos SAS","purpose":"studio_operations"}');

insert into organizations.organization_memberships (id, organization_id, person_id, status)
values
  ('019c3100-0000-7000-8000-000000000201', '019c3100-0000-7000-8000-000000000101',
   '019c3100-0000-7000-8000-000000000001', 'active'),
  ('019c3100-0000-7000-8000-000000000202', '019c3100-0000-7000-8000-000000000101',
   '019c3100-0000-7000-8000-000000000002', 'active'),
  ('019c3100-0000-7000-8000-000000000203', '019c3100-0000-7000-8000-000000000101',
   '019c3100-0000-7000-8000-000000000003', 'active'),
  ('019c3100-0000-7000-8000-000000000204', '019c3100-0000-7000-8000-000000000101',
   '019c3100-0000-7000-8000-000000000004', 'active'),
  ('019c3100-0000-7000-8000-000000000205', '019c3100-0000-7000-8000-000000000102',
   '019c3100-0000-7000-8000-000000000005', 'active'),
  ('019c3100-0000-7000-8000-000000000206', '019c3100-0000-7000-8000-000000000102',
   '019c3100-0000-7000-8000-000000000001', 'active');

-- Olivia also administers the gym next door, so its rows are visible to her: only each
-- function's own organization check keeps a path through Gimnasio Uno from reaching them.
insert into organizations.membership_roles (membership_id, role_code)
values
  ('019c3100-0000-7000-8000-000000000201', 'owner'),
  ('019c3100-0000-7000-8000-000000000202', 'admin'),
  ('019c3100-0000-7000-8000-000000000203', 'coach'),
  ('019c3100-0000-7000-8000-000000000204', 'staff'),
  ('019c3100-0000-7000-8000-000000000205', 'owner'),
  ('019c3100-0000-7000-8000-000000000206', 'admin');

insert into relationships.service_relationships (id, person_id, organization_id, status)
values ('019c3100-0000-7000-8000-000000000701', '019c3100-0000-7000-8000-000000000006',
  '019c3100-0000-7000-8000-000000000101', 'active');

-- Already on sale, so the list has a published plan to put first and renaming one is
-- possible without reaching for the publishing command.
insert into payments.organization_plans (id, organization_id, name, status)
values ('019c3100-0000-7000-8000-000000000401', '019c3100-0000-7000-8000-000000000101',
  'Trimestral', 'published');

insert into payments.plan_versions
  (id, plan_id, organization_id, version_number, amount_minor, currency_code,
   billing_period, status, published_at)
values ('019c3100-0000-7000-8000-000000000501', '019c3100-0000-7000-8000-000000000401',
  '019c3100-0000-7000-8000-000000000101', 1, 30000000, 'COP', 'month', 'published',
  clock_timestamp());

set local role allfit_owner;

select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000001', true),
       set_config('app.request_id', gen_random_uuid()::text, true);

-- ---------------------------------------------------------------------------
-- Creating — `OP-PAY-002`
-- ---------------------------------------------------------------------------

create temporary table created_plan on commit drop as
select result, replayed from payments.create_organization_plan(
  '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
  'Mensual', '019c3100-0000-7000-8000-00000000a001', '019c3100-0000-7000-8000-00000000a001',
  extensions.digest('create-mensual', 'sha256'));

select is(
  (select result->>'name' from created_plan),
  'Mensual',
  'the owner creates a plan with a name and nothing else'
);

select is(
  (select result->>'status' from created_plan),
  'draft',
  'and it is a draft: nobody can buy a plan that has no price'
);

select is(
  (select (result->>'on_sale')::boolean
          or (result->'current_version') <> 'null'::jsonb
          or jsonb_array_length(result->'versions') > 0
     from created_plan),
  false,
  'with no version, it is not on sale'
);

select is(
  (select replayed from payments.create_organization_plan(
    '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
    'Mensual', '019c3100-0000-7000-8000-00000000a001', '019c3100-0000-7000-8000-00000000a001',
    extensions.digest('create-mensual', 'sha256'))),
  true,
  'the same command repeated says it is a replay'
);

select is(
  (select count(*)::integer from payments.organization_plans
    where organization_id = '019c3100-0000-7000-8000-000000000101' and name = 'Mensual'),
  1,
  'and creates nothing the second time'
);

select throws_ok(
  $$select * from payments.create_organization_plan(
      '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
      'Otro', '019c3100-0000-7000-8000-00000000a001', '019c3100-0000-7000-8000-00000000a001',
      extensions.digest('create-otro', 'sha256'))$$,
  '23505',
  null,
  'a key reused with a different request is refused'
);

select set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000002', true);

select is(
  (select result->>'name' from payments.create_organization_plan(
    '019c3100-0000-7000-8000-000000000002', '019c3100-0000-7000-8000-000000000101',
    '  Anual  ', '019c3100-0000-7000-8000-00000000a002', '019c3100-0000-7000-8000-00000000a002',
    extensions.digest('create-anual', 'sha256'))),
  'Anual',
  'the admin creates one too, and the name is kept without its spaces'
);

select throws_ok(
  $$select * from payments.create_organization_plan(
      '019c3100-0000-7000-8000-000000000002', '019c3100-0000-7000-8000-000000000101',
      'mensual', '019c3100-0000-7000-8000-00000000a003', '019c3100-0000-7000-8000-00000000a003',
      extensions.digest('create-mensual-lower', 'sha256'))$$,
  '23505',
  null,
  'two plans of one gym cannot share a name, whatever the case'
);

select throws_ok(
  $$select * from payments.create_organization_plan(
      '019c3100-0000-7000-8000-000000000002', '019c3100-0000-7000-8000-000000000101',
      '', '019c3100-0000-7000-8000-00000000a004', '019c3100-0000-7000-8000-00000000a004',
      extensions.digest('create-empty', 'sha256'))$$,
  '22023',
  null,
  'an empty name is refused'
);

select throws_ok(
  $$select * from payments.create_organization_plan(
      '019c3100-0000-7000-8000-000000000002', '019c3100-0000-7000-8000-000000000101',
      '    ', '019c3100-0000-7000-8000-00000000a005', '019c3100-0000-7000-8000-00000000a005',
      extensions.digest('create-blank', 'sha256'))$$,
  '22023',
  null,
  'and so is a name of only spaces'
);

select throws_ok(
  format($$select * from payments.create_organization_plan(
      '019c3100-0000-7000-8000-000000000002', '019c3100-0000-7000-8000-000000000101',
      %L, '019c3100-0000-7000-8000-00000000a006', '019c3100-0000-7000-8000-00000000a006',
      extensions.digest('create-long', 'sha256'))$$, repeat('x', 81)),
  '22023',
  null,
  'and a name longer than eighty characters'
);

select lives_ok(
  format($$select * from payments.create_organization_plan(
      '019c3100-0000-7000-8000-000000000002', '019c3100-0000-7000-8000-000000000101',
      %L, '019c3100-0000-7000-8000-00000000a007', '019c3100-0000-7000-8000-00000000a007',
      extensions.digest('create-eighty', 'sha256'))$$, repeat('z', 80)),
  'eighty characters fit'
);

select set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000003', true);

select throws_ok(
  $$select * from payments.create_organization_plan(
      '019c3100-0000-7000-8000-000000000003', '019c3100-0000-7000-8000-000000000101',
      'Del coach', '019c3100-0000-7000-8000-00000000a008', '019c3100-0000-7000-8000-00000000a008',
      extensions.digest('create-coach', 'sha256'))$$,
  '42501',
  null,
  'a coach does not create plans'
);

select set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000004', true);

select throws_ok(
  $$select * from payments.create_organization_plan(
      '019c3100-0000-7000-8000-000000000004', '019c3100-0000-7000-8000-000000000101',
      'Del staff', '019c3100-0000-7000-8000-00000000a009', '019c3100-0000-7000-8000-00000000a009',
      extensions.digest('create-staff', 'sha256'))$$,
  '42501',
  null,
  'nor does staff'
);

select set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000005', true);

select throws_ok(
  $$select * from payments.create_organization_plan(
      '019c3100-0000-7000-8000-000000000005', '019c3100-0000-7000-8000-000000000101',
      'Intruso', '019c3100-0000-7000-8000-00000000a010', '019c3100-0000-7000-8000-00000000a010',
      extensions.digest('create-intruder', 'sha256'))$$,
  '42501',
  null,
  'nor the owner of the gym next door'
);

create temporary table foreign_plan on commit drop as
select result from payments.create_organization_plan(
  '019c3100-0000-7000-8000-000000000005', '019c3100-0000-7000-8000-000000000102',
  'Mensual', '019c3100-0000-7000-8000-00000000a011', '019c3100-0000-7000-8000-00000000a011',
  extensions.digest('create-mensual-dos', 'sha256'));

select is(
  (select result->>'name' from foreign_plan),
  'Mensual',
  'who can name a plan of her own gym the way gym one named its own'
);

select throws_ok(
  $$select * from payments.create_organization_plan(
      '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
      'Suplantado', '019c3100-0000-7000-8000-00000000a012', '019c3100-0000-7000-8000-00000000a012',
      extensions.digest('create-spoofed', 'sha256'))$$,
  '42501',
  null,
  'and the acting person cannot claim to be somebody else'
);

-- ---------------------------------------------------------------------------
-- Renaming — `OP-PAY-003`
-- ---------------------------------------------------------------------------

select set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000001', true);

select is(
  (select result->>'name' from payments.rename_organization_plan(
    '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
    (select id from payments.organization_plans where name = 'Anual'),
    'Anual full', '019c3100-0000-7000-8000-00000000b001', '019c3100-0000-7000-8000-00000000b001',
    extensions.digest('rename-anual', 'sha256'))),
  'Anual full',
  'a draft is renamed'
);

select is(
  (select result->>'name' from payments.rename_organization_plan(
    '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
    '019c3100-0000-7000-8000-000000000401',
    'Trimestral presencial', '019c3100-0000-7000-8000-00000000b002',
    '019c3100-0000-7000-8000-00000000b002', extensions.digest('rename-trimestral', 'sha256'))),
  'Trimestral presencial',
  'and so is a plan already on sale, which its subscribers now see by the new name'
);

select is(
  (select result->>'name' || ':' || replayed::text from payments.rename_organization_plan(
    '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
    '019c3100-0000-7000-8000-000000000401',
    'Trimestral presencial', '019c3100-0000-7000-8000-00000000b003',
    '019c3100-0000-7000-8000-00000000b003', extensions.digest('rename-same', 'sha256'))),
  'Trimestral presencial:false',
  'renaming to the name it already has changes nothing and is not an error'
);

select throws_ok(
  $$select * from payments.rename_organization_plan(
      '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
      '019c3100-0000-7000-8000-000000000401',
      'MENSUAL', '019c3100-0000-7000-8000-00000000b004', '019c3100-0000-7000-8000-00000000b004',
      extensions.digest('rename-taken', 'sha256'))$$,
  '23505',
  null,
  'a name another plan of the gym already has is refused'
);

select throws_ok(
  $$select * from payments.rename_organization_plan(
      '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
      '019c3100-0000-7000-8000-000000000401',
      '  ', '019c3100-0000-7000-8000-00000000b005', '019c3100-0000-7000-8000-00000000b005',
      extensions.digest('rename-blank', 'sha256'))$$,
  '22023',
  null,
  'and so is a blank one'
);

select throws_ok(
  $$select * from payments.rename_organization_plan(
      '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
      (select (result->>'plan_id')::uuid from foreign_plan),
      'Robado', '019c3100-0000-7000-8000-00000000b006', '019c3100-0000-7000-8000-00000000b006',
      extensions.digest('rename-foreign', 'sha256'))$$,
  'P0002',
  'plan not found',
  'a plan of another gym does not exist from here, even for an admin of both'
);

select set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000003', true);

select throws_ok(
  $$select * from payments.rename_organization_plan(
      '019c3100-0000-7000-8000-000000000003', '019c3100-0000-7000-8000-000000000101',
      '019c3100-0000-7000-8000-000000000401',
      'Del coach', '019c3100-0000-7000-8000-00000000b007', '019c3100-0000-7000-8000-00000000b007',
      extensions.digest('rename-coach', 'sha256'))$$,
  '42501',
  null,
  'a coach renames nothing'
);

-- ---------------------------------------------------------------------------
-- Reading — `OP-PAY-006`
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from payments.list_organization_plans_for_team(
    '019c3100-0000-7000-8000-000000000003', '019c3100-0000-7000-8000-000000000101',
    50, null, null, null)),
  4,
  'the coach reads every plan of the gym, drafts included'
);

select set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000004', true);

select is(
  (select count(*)::integer from payments.list_organization_plans_for_team(
    '019c3100-0000-7000-8000-000000000004', '019c3100-0000-7000-8000-000000000101',
    50, null, null, null)),
  4,
  'and so does staff'
);

select set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000001', true);

select is(
  (select array_agg(name order by ordinality)
     from payments.list_organization_plans_for_team(
       '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
       50, null, null, null) with ordinality),
  array['Trimestral presencial', 'Anual full', 'Mensual', repeat('z', 80)],
  'what is on sale comes first, then the drafts by name'
);

select is(
  (select plan->'current_version'->>'amount_minor'
     from payments.list_organization_plans_for_team(
       '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
       50, null, null, null)
    where plan_id = '019c3100-0000-7000-8000-000000000401'),
  '30000000',
  'and a plan on sale carries its current price'
);

create temporary table first_page on commit drop as
select plan_id, status, name
from payments.list_organization_plans_for_team(
  '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
  2, null, null, null) with ordinality
order by ordinality;

select is((select count(*)::integer from first_page), 2, 'a page holds what was asked for');

select is(
  (select count(distinct plan_id)::integer from (
     select plan_id from first_page
     union all
     select page.plan_id
     from payments.list_organization_plans_for_team(
       '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
       50,
       (select status from first_page where name = 'Anual full'),
       (select name from first_page where name = 'Anual full'),
       (select plan_id from first_page where name = 'Anual full')) as page
   ) as both_pages),
  4,
  'and the next page starts after it, with nothing repeated and nothing skipped'
);

select throws_ok(
  $$select * from payments.list_organization_plans_for_team(
      '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
      50, 'draft', null, null)$$,
  '22023',
  null,
  'a cursor comes whole or not at all'
);

select throws_ok(
  $$select * from payments.list_organization_plans_for_team(
      '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
      0, null, null, null)$$,
  '22023',
  null,
  'a page of nothing is not a page'
);

select throws_ok(
  $$select * from payments.list_organization_plans_for_team(
      '019c3100-0000-7000-8000-000000000001', '019c3100-0000-7000-8000-000000000101',
      102, null, null, null)$$,
  '22023',
  null,
  'nor is one past the cap'
);

select set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000006', true);

select throws_ok(
  $$select * from payments.list_organization_plans_for_team(
      '019c3100-0000-7000-8000-000000000006', '019c3100-0000-7000-8000-000000000101',
      50, null, null, null)$$,
  '42501',
  null,
  'a client is not the team: she sees what is offered in Space, never the drafts'
);

select set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000007', true);

select throws_ok(
  $$select * from payments.list_organization_plans_for_team(
      '019c3100-0000-7000-8000-000000000007', '019c3100-0000-7000-8000-000000000101',
      50, null, null, null)$$,
  '42501',
  null,
  'and somebody with no tie to the gym reads nothing'
);

select set_config('app.actor_person_id', '019c3100-0000-7000-8000-000000000005', true);

select throws_ok(
  $$select * from payments.list_organization_plans_for_team(
      '019c3100-0000-7000-8000-000000000005', '019c3100-0000-7000-8000-000000000101',
      50, null, null, null)$$,
  '42501',
  null,
  'nor does the owner of the gym next door'
);

reset role;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('allfit_api',
    'payments.create_organization_plan(uuid, uuid, text, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api',
    'payments.rename_organization_plan(uuid, uuid, uuid, text, uuid, uuid, bytea)', 'execute')
  and has_function_privilege('allfit_api',
    'payments.list_organization_plans_for_team(uuid, uuid, integer, text, text, uuid)',
    'execute'),
  'the API calls the three entry points'
);

select ok(
  not has_function_privilege('allfit_api',
    'payments.organization_plan_projection(uuid)', 'execute'),
  'and not the projection behind them'
);

select * from finish();

rollback;
