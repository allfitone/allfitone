-- T-ORG-QUOTA-02 — OP-ORG-023 names the agreement that sold the number (`HU-BO-027` c2, c5).
--
-- **No quota without a named agreement.** What Allfit charges a gym is billed outside
-- the platform, so the reference is the only thread from a number on screen back to
-- the deal that justified it. A call without one is refused, and so is a blank one, a
-- very long one or one spread over several lines, which are not references.
--
-- **The agreement is part of what was sold.** A renewal that keeps the same number
-- under a new agreement is a decision and leaves a record; the same number under the
-- same agreement is not one and leaves nothing.
--
-- **The history written before this keeps reading.** Changes recorded without a
-- reference stay valid, and say they have none rather than inventing one.

begin;

select plan(17);

insert into identity.people (id, given_name, family_name, status)
values
  ('019b2700-0000-7000-8000-000000000001', 'Manager', 'Alpha', 'active'),
  ('019b2700-0000-7000-8000-000000000002', 'Manager', 'Beta', 'active'),
  ('019b2700-0000-7000-8000-000000000003', 'Commercial', 'Gamma', 'active');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019b2700-0000-7000-8000-000000000021', 'workos', 'https://issuer.test', 'alpha27', null),
  ('019b2700-0000-7000-8000-000000000022', 'workos', 'https://issuer.test', 'beta27', null),
  ('019b2700-0000-7000-8000-000000000023', 'workos', 'https://issuer.test', 'gamma27',
    '019b2700-0000-7000-8000-000000000003');

select support.bootstrap_backoffice_administrators(
  '019b2700-0000-7000-8000-000000000001', 'alpha27',
  '019b2700-0000-7000-8000-000000000002', 'beta27',
  'https://issuer.test', clock_timestamp() + interval '30 days', 'CEREMONY-ORG-QUOTA-02'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
) values
  ('019b2700-0000-7000-8000-000000000041', '019b2700-0000-7000-8000-000000000021',
    'sid_alpha_27', 'backoffice', decode(repeat('c1', 32), 'hex'), 'v1.alpha',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours'),
  ('019b2700-0000-7000-8000-000000000043', '019b2700-0000-7000-8000-000000000023',
    'sid_gamma_27', 'backoffice', decode(repeat('c3', 32), 'hex'), 'v1.gamma',
    clock_timestamp() + interval '5 minutes', 2, 'password_totp',
    clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours');

select support.assign_platform_role(
  '019b2700-0000-7000-8000-000000000001', '019b2700-0000-7000-8000-000000000041',
  '019b2700-0000-7000-8000-000000000003', 'allfit_admin',
  '019b2700-0000-7000-8000-000000000103', '019b2700-0000-7000-8000-000000000203',
  decode(repeat('d3', 32), 'hex')
);

-- Converges onto the duty the role already brings.
select support.assign_platform_duty(
  '019b2700-0000-7000-8000-000000000001', '019b2700-0000-7000-8000-000000000041',
  '019b2700-0000-7000-8000-000000000003', 'manage_platform_commercial',
  clock_timestamp(), clock_timestamp() + interval '30 days', 'CASE-2026-027',
  '019b2700-0000-7000-8000-000000000113', '019b2700-0000-7000-8000-000000000213',
  decode(repeat('e3', 32), 'hex')
);

insert into organizations.organizations (
  id, type_code, display_name, legal_name, responsible_party
) values
  ('019b2700-0000-7000-8000-000000000301', 'gym', 'Acuerdo Norte', 'Acuerdo Norte SAS',
    '{"party_kind":"legal_entity","party_name":"Acuerdo Norte SAS","purpose":"studio_operations"}'::jsonb),
  ('019b2700-0000-7000-8000-000000000302', 'gym', 'Acuerdo Viejo', 'Acuerdo Viejo SAS',
    '{"party_kind":"legal_entity","party_name":"Acuerdo Viejo SAS","purpose":"studio_operations"}'::jsonb);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019b2700-0000-7000-8000-000000000003', true);

-- ---------------------------------------------------------------------------
-- No number without a named agreement
-- ---------------------------------------------------------------------------

select hasnt_function(
  'organizations', 'set_organization_guest_quota',
  array['uuid', 'uuid', 'uuid', 'integer', 'uuid', 'uuid', 'bytea'],
  'no way is left to set a quota without saying which agreement sold it'
);

select throws_ok(
  $$ select organizations.set_organization_guest_quota(
    '019b2700-0000-7000-8000-000000000003', '019b2700-0000-7000-8000-000000000043',
    '019b2700-0000-7000-8000-000000000301', 50, null,
    '5f2b0001-0000-4000-8000-000000000001', '019b2700-0000-7000-8000-000000000901',
    decode(repeat('81', 32), 'hex')
  ) $$,
  '22023',
  null,
  'a quota with no agreement reference is refused'
);

select throws_ok(
  $$ select organizations.set_organization_guest_quota(
    '019b2700-0000-7000-8000-000000000003', '019b2700-0000-7000-8000-000000000043',
    '019b2700-0000-7000-8000-000000000301', 50, '   ',
    '5f2b0002-0000-4000-8000-000000000002', '019b2700-0000-7000-8000-000000000902',
    decode(repeat('82', 32), 'hex')
  ) $$,
  '22023',
  null,
  'and so is a blank one, which names nothing'
);

select throws_ok(
  $$ select organizations.set_organization_guest_quota(
    '019b2700-0000-7000-8000-000000000003', '019b2700-0000-7000-8000-000000000043',
    '019b2700-0000-7000-8000-000000000301', 50, repeat('A', 121),
    '5f2b0003-0000-4000-8000-000000000003', '019b2700-0000-7000-8000-000000000903',
    decode(repeat('83', 32), 'hex')
  ) $$,
  '22023',
  null,
  'and one longer than a reference, which is a note'
);

select throws_ok(
  $$ select organizations.set_organization_guest_quota(
    '019b2700-0000-7000-8000-000000000003', '019b2700-0000-7000-8000-000000000043',
    '019b2700-0000-7000-8000-000000000301', 50, 'CONTRATO' || chr(10) || '2026-014',
    '5f2b0004-0000-4000-8000-000000000004', '019b2700-0000-7000-8000-000000000904',
    decode(repeat('84', 32), 'hex')
  ) $$,
  '22023',
  null,
  'and one spread over several lines'
);

select is(
  (select count(*)::integer from organizations.organization_events
    where organization_id = '019b2700-0000-7000-8000-000000000301'),
  0,
  'none of the refusals left a record or a number behind'
);

-- ---------------------------------------------------------------------------
-- The agreement is written with the number, and read back with it
-- ---------------------------------------------------------------------------

create temporary table sold on commit drop as
select result from organizations.set_organization_guest_quota(
  '019b2700-0000-7000-8000-000000000003', '019b2700-0000-7000-8000-000000000043',
  '019b2700-0000-7000-8000-000000000301', 50, '  CONTRATO-2026-014 ',
  '5f2b0005-0000-4000-8000-000000000005', '019b2700-0000-7000-8000-000000000905',
  decode(repeat('85', 32), 'hex')
) as result;

select is(
  (select result->>'agreement_reference' from sold),
  'CONTRATO-2026-014',
  'the quota says which agreement it stands on, without the spaces around it'
);

select is(
  (select result #>> '{last_change,agreement_reference}' from sold),
  'CONTRATO-2026-014',
  'and the last change names it'
);

select is(
  (select result #>> '{history,0,agreement_reference}' from sold),
  'CONTRATO-2026-014',
  'and so does the history'
);

select ok(
  (select event.after_snapshot->>'agreement_reference' = 'CONTRATO-2026-014'
     and event.before_snapshot->'agreement_reference' = 'null'::jsonb
   from organizations.organization_events as event
   where event.organization_id = '019b2700-0000-7000-8000-000000000301'),
  'the record keeps the agreement, and that there was none before'
);

-- ---------------------------------------------------------------------------
-- A renewal is a decision; repeating one is not
-- ---------------------------------------------------------------------------

create temporary table renewed on commit drop as
select result from organizations.set_organization_guest_quota(
  '019b2700-0000-7000-8000-000000000003', '019b2700-0000-7000-8000-000000000043',
  '019b2700-0000-7000-8000-000000000301', 50, 'OTROSI-2026-031',
  '5f2b0006-0000-4000-8000-000000000006', '019b2700-0000-7000-8000-000000000906',
  decode(repeat('86', 32), 'hex')
) as result;

select ok(
  (select jsonb_array_length(result->'history') = 2
     and result #>> '{history,0,agreement_reference}' = 'OTROSI-2026-031'
     and result #>> '{history,1,agreement_reference}' = 'CONTRATO-2026-014'
   from renewed),
  'the same number under a new agreement is a renewal, and it is recorded'
);

select ok(
  (select event.before_snapshot->>'agreement_reference' = 'CONTRATO-2026-014'
   from organizations.organization_events as event
   where event.organization_id = '019b2700-0000-7000-8000-000000000301'
   order by event.occurred_at desc, event.id desc
   limit 1),
  'and its record says which agreement it replaced'
);

select is(
  (select jsonb_array_length(result->'history')
   from organizations.set_organization_guest_quota(
     '019b2700-0000-7000-8000-000000000003', '019b2700-0000-7000-8000-000000000043',
     '019b2700-0000-7000-8000-000000000301', 50, 'OTROSI-2026-031',
     '5f2b0007-0000-4000-8000-000000000007', '019b2700-0000-7000-8000-000000000907',
     decode(repeat('87', 32), 'hex')
   )),
  2,
  'the same number under the same agreement, sent again, is no change at all'
);

-- ---------------------------------------------------------------------------
-- The history written before the reference existed
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into organizations.organization_events (
    organization_id, event_type, before_snapshot, after_snapshot,
    actor_person_id, actor_duty_assignment_id
  ) values (
    '019b2700-0000-7000-8000-000000000302',
    'organization.guest_quota_set.v1',
    '{"guest_quota_seats": null, "revision_number": 0}'::jsonb,
    '{"guest_quota_seats": 10, "revision_number": 1}'::jsonb,
    '019b2700-0000-7000-8000-000000000003',
    (select id from support.platform_duty_assignments
      where person_id = '019b2700-0000-7000-8000-000000000003'
        and duty_code = 'manage_platform_commercial')
  ) $$,
  'a change recorded before the reference existed is still a valid record'
);

select is(
  (select organizations.guest_quota_projection('019b2700-0000-7000-8000-000000000302')
     #> '{history,0,agreement_reference}'),
  'null'::jsonb,
  'and it reads as having no reference rather than as an invented one'
);

select throws_ok(
  $$ insert into organizations.organization_events (
    organization_id, event_type, before_snapshot, after_snapshot,
    actor_person_id, actor_duty_assignment_id
  ) values (
    '019b2700-0000-7000-8000-000000000302',
    'organization.guest_quota_set.v1',
    '{"guest_quota_seats": 10, "agreement_reference": null, "revision_number": 1}'::jsonb,
    '{"guest_quota_seats": 20, "agreement_reference": " ", "revision_number": 2}'::jsonb,
    '019b2700-0000-7000-8000-000000000003',
    (select id from support.platform_duty_assignments
      where person_id = '019b2700-0000-7000-8000-000000000003'
        and duty_code = 'manage_platform_commercial')
  ) $$,
  '23514',
  null,
  'a record whose agreement is blank is not a record of an agreement'
);

select throws_ok(
  $$ insert into organizations.organization_events (
    organization_id, event_type, before_snapshot, after_snapshot,
    actor_person_id, actor_duty_assignment_id
  ) values (
    '019b2700-0000-7000-8000-000000000302',
    'organization.guest_quota_set.v1',
    '{"guest_quota_seats": 10, "agreement_reference": "CONTRATO-2026-001", "revision_number": 1}'::jsonb,
    '{"guest_quota_seats": 20, "agreement_reference": null, "revision_number": 2}'::jsonb,
    '019b2700-0000-7000-8000-000000000003',
    (select id from support.platform_duty_assignments
      where person_id = '019b2700-0000-7000-8000-000000000003'
        and duty_code = 'manage_platform_commercial')
  ) $$,
  '23514',
  null,
  'and a change that leaves the gym with no agreement is not recorded either'
);

select finish();

rollback;
