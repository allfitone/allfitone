-- T-IDN-VERIFY-NAME-01 — HU-BO-021 criterion 7: changing her name opens a new review of
-- a verified credential, and the earlier verification stays intact.
--
-- Since TECH-43 a person corrects her own name from Space (`identity.correct_own_name`).
-- A credential verified against her old name kept reading as verified and nobody looked
-- again. Now a change of name with a verified credential still in force puts that
-- credential back in the queue as a `name_change` review, superseding the request that
-- verified it. The verification itself is never touched: the reviewer decides whether
-- the credential still matches.
--
-- It does not open a review for a credential with no verification in force, for one
-- already under review, for a retired one, or for a change that leaves the name as it was.

begin;

select plan(9);

insert into identity.people (id, given_name, family_name, status, username)
values
  ('019ca000-0000-7000-8000-000000000001', 'Verificadora', 'Uno', 'active', null),
  ('019ca000-0000-7000-8000-000000000005', 'Paula', 'Vieja', 'active', 'paula_pro'),
  ('019ca000-0000-7000-8000-000000000006', 'Quique', 'Pendiente', 'active', null),
  ('019ca000-0000-7000-8000-000000000007', 'Rosa', 'Vencida', 'active', null),
  ('019ca000-0000-7000-8000-000000000008', 'Sara', 'Igual', 'active', 'sara_pro');

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values ('019ca000-0000-7000-8000-000000000015', 'workos', 'https://issuer.test', 'paula-space',
  '019ca000-0000-7000-8000-000000000005');

insert into identity.professional_profiles (id, person_id, headline, bio, practice_started_year)
select profile_id, person_id, 'Nutricionista', 'Nutrición deportiva.', 2018
from (values
  ('019ca000-0000-7000-8000-000000000105'::uuid, '019ca000-0000-7000-8000-000000000005'::uuid),
  ('019ca000-0000-7000-8000-000000000106'::uuid, '019ca000-0000-7000-8000-000000000006'::uuid),
  ('019ca000-0000-7000-8000-000000000107'::uuid, '019ca000-0000-7000-8000-000000000007'::uuid),
  ('019ca000-0000-7000-8000-000000000108'::uuid, '019ca000-0000-7000-8000-000000000008'::uuid)
) as profile_row(profile_id, person_id);

-- Declaring each credential opens its initial request, as the queue does on its own.
insert into identity.professional_credentials (
  id, professional_profile_id, credential_type_code, issuer, name, identifier
)
select credential_id, profile_id, 'professional_license', 'Colegio de Nutricionistas',
  'Tarjeta profesional', identifier
from (values
  ('019ca000-0000-7000-8000-000000000205'::uuid, '019ca000-0000-7000-8000-000000000105'::uuid, 'TP-205'),
  ('019ca000-0000-7000-8000-000000000206'::uuid, '019ca000-0000-7000-8000-000000000106'::uuid, 'TP-206'),
  ('019ca000-0000-7000-8000-000000000207'::uuid, '019ca000-0000-7000-8000-000000000107'::uuid, 'TP-207'),
  ('019ca000-0000-7000-8000-000000000208'::uuid, '019ca000-0000-7000-8000-000000000108'::uuid, 'TP-208')
) as credential_row(credential_id, profile_id, identifier);

-- Paula and Sara were verified ten days ago; Rosa's verification lapsed; Quique's is pending.
update identity.credential_verification_requests
set status = 'resolved', resolved_at = clock_timestamp()
where professional_credential_id in (
  '019ca000-0000-7000-8000-000000000205', '019ca000-0000-7000-8000-000000000207',
  '019ca000-0000-7000-8000-000000000208'
);

insert into identity.professional_credential_verifications (
  professional_credential_id, verifier_person_id, policy_code, method, source_authority,
  source_jurisdiction, source_reference, source_status, source_checked_at, evidence_fingerprint,
  result, decided_at, valid_from, valid_to, request_id
)
select
  request.professional_credential_id, '019ca000-0000-7000-8000-000000000001', 'registry_v1',
  'official_registry_lookup', 'Registro de nutricionistas', 'CO', 'REF-' || request.id::text,
  'active', decree.decided, decode(repeat('9a', 32), 'hex'), 'verified', decree.decided,
  decree.decided, decree.until, request.id
from identity.credential_verification_requests as request
cross join lateral (
  -- Rosa's was decided long ago and lapsed; the others are ten days old and in force.
  select
    case when lapsed then clock_timestamp() - interval '400 days'
      else clock_timestamp() - interval '10 days' end as decided,
    case when lapsed then clock_timestamp() - interval '40 days'
      else clock_timestamp() + interval '180 days' end as until
  from (
    select request.professional_credential_id = '019ca000-0000-7000-8000-000000000207' as lapsed
  ) as flag
) as decree
where request.professional_credential_id in (
  '019ca000-0000-7000-8000-000000000205', '019ca000-0000-7000-8000-000000000207',
  '019ca000-0000-7000-8000-000000000208'
);

create temporary table verified_request on commit drop as
select id from identity.credential_verification_requests
where professional_credential_id = '019ca000-0000-7000-8000-000000000205';

-- Paula corrects her own name from Space, the way the app does it.
select set_config('app.actor_kind', 'person', true),
       set_config('app.actor_person_id', '019ca000-0000-7000-8000-000000000005', true);
set local role allfit_api;
select * from identity.correct_own_name(
  'workos', 'https://issuer.test', 'paula-space', 'Paula', 'Nueva', 'paula_pro',
  'c9a00000-0000-4000-8000-000000000001', '019ca000-0000-7000-8000-000000000301',
  decode(repeat('a9', 32), 'hex')
);
reset role;

select is(
  (select count(*) from identity.credential_verification_requests
   where professional_credential_id = '019ca000-0000-7000-8000-000000000205'
     and status = 'pending' and kind = 'name_change'),
  1::bigint,
  'changing her name puts her verified credential back in the queue'
);

select ok(
  (select request.requested_by_person_id = '019ca000-0000-7000-8000-000000000005'
     and request.supersedes_request_id = (select id from verified_request)
   from identity.credential_verification_requests as request
   where request.professional_credential_id = '019ca000-0000-7000-8000-000000000205'
     and request.status = 'pending'),
  'the review names her and the request it reopens'
);

select is(
  (select string_agg(result || ':' || (valid_to > clock_timestamp())::text, ',')
   from identity.professional_credential_verifications
   where professional_credential_id = '019ca000-0000-7000-8000-000000000205'),
  'verified:true',
  'the earlier verification stays intact, and still in force'
);

-- A second change while the review is pending opens no second review.
update identity.people set given_name = 'Paulina'
where id = '019ca000-0000-7000-8000-000000000005';

select is(
  (select count(*) from identity.credential_verification_requests
   where professional_credential_id = '019ca000-0000-7000-8000-000000000205'
     and status = 'pending'),
  1::bigint,
  'a credential already under review gets no second review'
);

update identity.people set family_name = 'Distinto'
where id = '019ca000-0000-7000-8000-000000000006';

select is(
  (select count(*) from identity.credential_verification_requests
   where professional_credential_id = '019ca000-0000-7000-8000-000000000206'
     and kind = 'name_change'),
  0::bigint,
  'a credential never verified is not reopened by a name change'
);

update identity.people set family_name = 'Renombrada'
where id = '019ca000-0000-7000-8000-000000000007';

select is(
  (select count(*) from identity.credential_verification_requests
   where professional_credential_id = '019ca000-0000-7000-8000-000000000207'
     and kind = 'name_change'),
  0::bigint,
  'a lapsed verification is renewed, not reopened by a name change'
);

update identity.people set username = 'sara_nueva', family_name = 'Igual'
where id = '019ca000-0000-7000-8000-000000000008';

select is(
  (select count(*) from identity.credential_verification_requests
   where professional_credential_id = '019ca000-0000-7000-8000-000000000208'
     and kind = 'name_change'),
  0::bigint,
  'a change that leaves the name as it was opens nothing'
);

update identity.professional_credentials
set status = 'retired', retired_at = clock_timestamp()
where id = '019ca000-0000-7000-8000-000000000208';
update identity.people set given_name = 'Sarita'
where id = '019ca000-0000-7000-8000-000000000008';

select is(
  (select count(*) from identity.credential_verification_requests
   where professional_credential_id = '019ca000-0000-7000-8000-000000000208'
     and kind = 'name_change'),
  0::bigint,
  'a retired credential is not reopened'
);

select throws_ok(
  $$ insert into identity.credential_verification_requests (
       professional_credential_id, requested_by_person_id, kind
     ) values (
       '019ca000-0000-7000-8000-000000000206', '019ca000-0000-7000-8000-000000000006', 'appeal'
     ) $$,
  '23514',
  null,
  'the kinds of review stay a closed list'
);

select * from finish();

rollback;
