-- T-ORG-HANDOVER-02 — the handover keeps a natural person's address once they claim the
-- gym (`HU-BO-013` c5, `HU-BO-014`).
--
-- The gym's file withholds the site address of a gym a natural person answers for: it
-- is where somebody lives or works alone. The handover kept showing it after the owner
-- claimed the gym, so the same address the file reserves was one link away.
--
-- Before the claim the address is what Allfit typed when it created the gym, and the
-- handover shows it. After it, the address belongs to the owner and is withheld, saying
-- so. A company's address is never withheld.

begin;

select plan(5);

insert into organizations.organizations (
  id, type_code, display_name, legal_name, status, claimed_at, responsible_party
) values
  ('019b8000-0000-7000-8000-000000000301', 'professional_practice', 'Entrena Conmigo', null,
    'unclaimed', null, '{"party_kind":"natural_person","purpose":"studio_operations"}'::jsonb),
  ('019b8000-0000-7000-8000-000000000302', 'professional_practice', 'Entrena Sola', null,
    'active', clock_timestamp(),
    '{"party_kind":"natural_person","party_name":"Ana Sola","purpose":"studio_operations"}'::jsonb),
  ('019b8000-0000-7000-8000-000000000303', 'gym', 'Gimnasio Empresa', 'Empresa SAS',
    'active', clock_timestamp(),
    '{"party_kind":"legal_entity","party_name":"Empresa SAS","purpose":"studio_operations"}'::jsonb);

insert into organizations.organization_sites (organization_id, name, address)
values
  ('019b8000-0000-7000-8000-000000000301', 'Sede', 'Calle 1 # 2-3'),
  ('019b8000-0000-7000-8000-000000000302', 'Sede', 'Calle 4 # 5-6'),
  ('019b8000-0000-7000-8000-000000000303', 'Sede', 'Carrera 7 # 8-9');

select is(
  (organizations.handover_projection('019b8000-0000-7000-8000-000000000301')->'site')
    - 'site_id' - 'name',
  '{"address": "Calle 1 # 2-3", "address_withheld": false}'::jsonb,
  'before the claim, the address Allfit typed is shown'
);

select is(
  organizations.handover_projection('019b8000-0000-7000-8000-000000000302') #>> '{site,address}',
  null,
  'after a natural person claims the gym, the address is not shown'
);

select is(
  (organizations.handover_projection('019b8000-0000-7000-8000-000000000302')
    #>> '{site,address_withheld}')::boolean,
  true,
  'and the handover says it is withheld rather than absent'
);

select is(
  (organizations.handover_projection('019b8000-0000-7000-8000-000000000303')->'site')
    - 'site_id' - 'name',
  '{"address": "Carrera 7 # 8-9", "address_withheld": false}'::jsonb,
  'a company''s address is never withheld'
);

select is(
  organizations.handover_projection('019b8000-0000-7000-8000-000000000302') #>> '{site,name}',
  'Sede',
  'the site is still named'
);

select * from finish();

rollback;
