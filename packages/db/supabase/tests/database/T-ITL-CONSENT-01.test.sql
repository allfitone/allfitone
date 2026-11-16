-- The AI consent: a person decides whether the assistant may use her data
-- (`OP-ITL-001..003`; HU-SP-124 and HU-SP-125; ADR-053, decision 4).
--
-- One person gives it, gives it again, accepts a later text, withdraws it and gives it
-- back; her neighbour can neither read it nor decide it for her, and nothing is ever
-- deleted. No text is published by the migration, so the two used here exist only in
-- this transaction.
--
-- Written before the schema existed, and seen to fail.
begin;

select plan(26);

select is(
  (select count(*)::integer from intelligence.consent_versions), 0,
  'T-ITL-CONSENT-01 no text is published until a migration publishes one');

insert into identity.people (id, given_name, family_name, status)
values ('019f1400-0000-7000-8000-000000000001', 'Quien', 'Decide', 'active'),
       ('019f1400-0000-7000-8000-000000000002', 'La', 'Vecina', 'active');

insert into intelligence.consent_versions (version) values ('2026-12-01'), ('2026-12-15');

select set_config('app.actor_kind', 'person', true);
select set_config('app.actor_person_id', '019f1400-0000-7000-8000-000000000001', true);

-- ———————————————————————————————— give (OP-ITL-001) and read (OP-ITL-003)

select is(
  intelligence.read_consent('019f1400-0000-7000-8000-000000000001'),
  '{"accepted_version": null, "accepted_at": null, "withdrawn_at": null}'::jsonb,
  'T-ITL-CONSENT-02 nobody has consented until they do');

select throws_ok(
  $$ select intelligence.give_consent('019f1400-0000-7000-8000-000000000001', '2026-11-30',
       'f7111111-1111-4111-8111-111111111401', extensions.uuid_generate_v7(), decode(repeat('41', 32), 'hex')) $$,
  '22023', null, 'T-ITL-CONSENT-03 a text that was never published is refused');

select intelligence.give_consent('019f1400-0000-7000-8000-000000000001', '2026-12-01',
  'f7111111-1111-4111-8111-111111111402', '019f1400-0000-7000-8000-000000000402', decode(repeat('42', 32), 'hex'));

select is(
  intelligence.read_consent('019f1400-0000-7000-8000-000000000001')->>'accepted_version',
  '2026-12-01', 'T-ITL-CONSENT-04 the accepted text is the one in force');

select is(
  (intelligence.give_consent('019f1400-0000-7000-8000-000000000001', '2026-12-01',
     'f7111111-1111-4111-8111-111111111402', '019f1400-0000-7000-8000-000000000402', decode(repeat('42', 32), 'hex'))->>'accepted_version'),
  '2026-12-01', 'T-ITL-IDEM-01 giving it again with the same key answers the same');

select is(
  (select count(*)::integer from intelligence.consents where person_id = '019f1400-0000-7000-8000-000000000001'),
  1, 'T-ITL-IDEM-01 and writes it once');

select throws_ok(
  $$ select intelligence.give_consent('019f1400-0000-7000-8000-000000000001', '2026-12-15',
       'f7111111-1111-4111-8111-111111111402', '019f1400-0000-7000-8000-000000000402', decode(repeat('43', 32), 'hex')) $$,
  '23505', null, 'T-ITL-IDEM-02 the same key for another request is refused');

-- The same text under a new command changes nothing: she already holds it.
select intelligence.give_consent('019f1400-0000-7000-8000-000000000001', '2026-12-01',
  'f7111111-1111-4111-8111-111111111403', '019f1400-0000-7000-8000-000000000403', decode(repeat('44', 32), 'hex'));

select is(
  (select count(*)::integer from intelligence.consents where person_id = '019f1400-0000-7000-8000-000000000001'),
  1, 'T-ITL-CONSENT-05 giving the text she already holds writes nothing new');

-- Another vendor is another text: the earlier one ends, and is kept.
select is(
  (intelligence.give_consent('019f1400-0000-7000-8000-000000000001', '2026-12-15',
     'f7111111-1111-4111-8111-111111111404', '019f1400-0000-7000-8000-000000000404', decode(repeat('45', 32), 'hex'))->>'accepted_version'),
  '2026-12-15', 'T-ITL-CONSENT-06 a later text replaces the one in force');

select is(
  (select array_agg(text_version || ':' || coalesce(end_reason, 'in-force') order by accepted_at)
   from intelligence.consents where person_id = '019f1400-0000-7000-8000-000000000001'),
  array['2026-12-01:replaced', '2026-12-15:in-force'],
  'T-ITL-INT-01 one consent is in force for a person, and the replaced one stays as it was');

-- ———————————————————————————————— withdraw (OP-ITL-002)

select intelligence.withdraw_consent('019f1400-0000-7000-8000-000000000001',
  'f7111111-1111-4111-8111-111111111405', '019f1400-0000-7000-8000-000000000405', decode(repeat('46', 32), 'hex'));

select is(
  intelligence.read_consent('019f1400-0000-7000-8000-000000000001')->>'accepted_version',
  null, 'T-ITL-CONSENT-07 withdrawn, nothing is in force');

select isnt(
  intelligence.read_consent('019f1400-0000-7000-8000-000000000001')->>'withdrawn_at',
  null, 'T-ITL-CONSENT-08 and when she withdrew it is kept');

select is(
  (select count(*)::integer from intelligence.consents where person_id = '019f1400-0000-7000-8000-000000000001'),
  2, 'T-ITL-CONSENT-09 withdrawing deletes nothing');

select is(
  intelligence.withdraw_consent('019f1400-0000-7000-8000-000000000001',
    'f7111111-1111-4111-8111-111111111405', '019f1400-0000-7000-8000-000000000405', decode(repeat('46', 32), 'hex'))->>'withdrawn_at',
  intelligence.read_consent('019f1400-0000-7000-8000-000000000001')->>'withdrawn_at',
  'T-ITL-IDEM-03 withdrawing again with the same key answers the same');

select is(
  intelligence.withdraw_consent('019f1400-0000-7000-8000-000000000001',
    'f7111111-1111-4111-8111-111111111406', '019f1400-0000-7000-8000-000000000406', decode(repeat('47', 32), 'hex'))->>'withdrawn_at',
  intelligence.read_consent('019f1400-0000-7000-8000-000000000001')->>'withdrawn_at',
  'T-ITL-CONSENT-10 withdrawing what is not in force changes nothing');

select intelligence.give_consent('019f1400-0000-7000-8000-000000000001', '2026-12-15',
  'f7111111-1111-4111-8111-111111111407', '019f1400-0000-7000-8000-000000000407', decode(repeat('48', 32), 'hex'));

select is(
  intelligence.read_consent('019f1400-0000-7000-8000-000000000001') - 'accepted_at',
  '{"accepted_version": "2026-12-15", "withdrawn_at": null}'::jsonb,
  'T-ITL-CONSENT-11 she can give it back, and it is in force again');

-- ———————————————————————————————— the neighbour

select set_config('app.actor_person_id', '019f1400-0000-7000-8000-000000000002', true);

select is(
  intelligence.read_consent('019f1400-0000-7000-8000-000000000001'),
  null, 'T-ITL-RLS-01 the neighbour does not read her consent');

select throws_ok(
  $$ select intelligence.give_consent('019f1400-0000-7000-8000-000000000001', '2026-12-15',
       'f7111111-1111-4111-8111-111111111408', extensions.uuid_generate_v7(), decode(repeat('49', 32), 'hex')) $$,
  '42501', null, 'T-ITL-RLS-02 nor gives it in her name');

select throws_ok(
  $$ select intelligence.withdraw_consent('019f1400-0000-7000-8000-000000000001',
       'f7111111-1111-4111-8111-111111111409', extensions.uuid_generate_v7(), decode(repeat('4a', 32), 'hex')) $$,
  '42501', null, 'T-ITL-RLS-03 nor withdraws it in her name');

set local role allfit_owner;
select is(
  (select count(*)::integer from intelligence.consents), 0,
  'T-ITL-RLS-04 straight at the table, the neighbour sees no consent of another''s');

select set_config('app.actor_person_id', '019f1400-0000-7000-8000-000000000001', true);
select is(
  (select count(*)::integer from intelligence.consents), 3,
  'T-ITL-RLS-05 and she sees her own, to prove the neighbour''s zero is the policy');

delete from intelligence.consents;
select is(
  (select count(*)::integer from intelligence.consents), 3,
  'T-ITL-RLS-06 no policy lets a consent be deleted, not even her own');

set local role allfit_api;
select throws_ok(
  $$ select count(*) from intelligence.consents $$,
  '42501', null, 'T-ITL-RLS-07 the runtime role has no privilege on the table');

-- ———————————————————————————————— history, with every policy out of the way

reset role;

select throws_ok(
  $$ delete from intelligence.consents where person_id = '019f1400-0000-7000-8000-000000000001' $$,
  '42501', null, 'T-ITL-INT-02 a consent is never deleted, whoever asks');

select throws_ok(
  $$ update intelligence.consents set ended_at = clock_timestamp()
     where person_id = '019f1400-0000-7000-8000-000000000001' and ended_at is not null $$,
  '42501', null, 'T-ITL-INT-03 a consent that ended does not end again');

select throws_ok(
  $$ update intelligence.consents set text_version = '2026-12-01'
     where person_id = '019f1400-0000-7000-8000-000000000001' and ended_at is null $$,
  '42501', null, 'T-ITL-INT-04 nor does the text a person accepted change under her');

select * from finish();
rollback;
