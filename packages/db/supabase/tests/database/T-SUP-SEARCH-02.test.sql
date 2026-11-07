-- T-SUP-SEARCH-02 — an administrator finds a person by part of a name, email or phone, and a
-- support read no longer needs a case (ADR-046 decisions 4 and 5).
--
-- The search matched only an exact email, phone or identifier, always under a case
-- reference, and answered a masked contact with no name. An administrator now finds her by
-- what they remember of her and sees her name and contact. Every search is still recorded,
-- and every person it returns sees it in her own history: the answer is a read of her.

begin;

select plan(27);

insert into identity.people (id, given_name, family_name, contact_email, contact_phone)
values
  ('019f8000-0000-7000-8000-000000000001', 'Admin', 'Alpha', null, null),
  ('019f8000-0000-7000-8000-000000000002', 'Admin', 'Beta', null, null),
  ('019f8000-0000-7000-8000-000000000003', 'Gamma', 'Ramírez', 'gamma@example.test', '+573001112233'),
  ('019f8000-0000-7000-8000-000000000004', 'Outsider', 'Delta', null, null),
  ('019f8000-0000-7000-8000-000000000005', 'Gamaliel', 'Soto', 'gsoto@mail.test', '+573209998877'),
  ('019f8000-0000-7000-8000-000000000006', 'Epsilon', 'Vega', 'epsilon@mail.test', null);

insert into identity.access_accounts (id, provider, issuer, subject, person_id)
values
  ('019f8000-0000-7000-8000-000000000011', 'workos', 'https://issuer.test', 'alpha', null),
  ('019f8000-0000-7000-8000-000000000012', 'workos', 'https://issuer.test', 'beta', null),
  ('019f8000-0000-7000-8000-000000000014', 'workos', 'https://issuer.test', 'delta',
    '019f8000-0000-7000-8000-000000000004');

select support.bootstrap_backoffice_administrators(
  '019f8000-0000-7000-8000-000000000001', 'alpha',
  '019f8000-0000-7000-8000-000000000002', 'beta',
  'https://issuer.test', null, 'CEREMONY-SEARCH-02'
);

insert into identity.access_sessions (
  id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
  access_token_expires_at, assurance_level, authentication_method,
  assurance_verified_at, last_activity_at, absolute_expires_at
)
select session_id, account_id, 'sid_' || suffix, 'backoffice',
  decode(repeat(hash_byte, 32), 'hex'), 'v1.' || suffix,
  clock_timestamp() + interval '5 minutes', 2, 'password_totp',
  clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '6 hours'
from (values
  ('019f8000-0000-7000-8000-000000000021'::uuid, '019f8000-0000-7000-8000-000000000011'::uuid,
    'alpha', 'd1'),
  ('019f8000-0000-7000-8000-000000000024'::uuid, '019f8000-0000-7000-8000-000000000014'::uuid,
    'delta', 'd4')
) as session_row(session_id, account_id, suffix, hash_byte);

select set_config('app.actor_kind', 'support', true),
       set_config('app.actor_person_id', '019f8000-0000-7000-8000-000000000001', true);

-- Part of a name -------------------------------------------------------------------------

select is(
  (select jsonb_path_query_array(
      support.search_people(
        '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
        null, 'gam', 25
      ), '$.matches[*].display_name'
  )),
  '["Gamaliel Soto", "Gamma Ramírez"]'::jsonb,
  'part of a name finds every person it belongs to, in name order, without a case'
);

select is(
  (select support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, 'RAMÍ', 25
  ) -> 'matches' -> 0),
  jsonb_build_object(
    'person_id', '019f8000-0000-7000-8000-000000000003',
    'display_name', 'Gamma Ramírez',
    'contact_email', 'gamma@example.test',
    'contact_phone', '+573001112233',
    'account_status', 'active'
  ),
  'regardless of case, and the answer carries her name and full contact'
);

select is(
  (select support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, 'gam', 25
  ) -> 'has_more'),
  'false'::jsonb,
  'and says when there is nothing more'
);

-- Part of an email, part of a phone, or the identifier.
select is(
  (select support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, 'example.te', 25
  ) #>> '{matches,0,person_id}'),
  '019f8000-0000-7000-8000-000000000003',
  'part of an email finds her'
);

select is(
  (select support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, '999887', 25
  ) #>> '{matches,0,person_id}'),
  '019f8000-0000-7000-8000-000000000005',
  'part of a phone number finds him'
);

select is(
  (select support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, '019f8000-0000-7000-8000-000000000006', 25
  ) #>> '{matches,0,display_name}'),
  'Epsilon Vega',
  'and the identifier still finds the person it names'
);

-- Wildcards are text, not patterns.
select is(
  (select jsonb_array_length(support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, '_a', 25
  ) -> 'matches')),
  0,
  'an underscore is searched as an underscore, not as any letter'
);

select is(
  (select jsonb_array_length(support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, '%%', 25
  ) -> 'matches')),
  0,
  'and a percent sign as a percent sign, so it never lists everybody'
);

-- A page at a time.
select is(
  (select jsonb_array_length(support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, 'gam', 1
  ) -> 'matches')),
  1,
  'it answers no more than it was asked for'
);

select is(
  (select support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, 'gam', 1
  ) -> 'has_more'),
  'true'::jsonb,
  'and says that there is more'
);

select throws_ok(
  $$ select support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, 'g', 25
  ) $$,
  '22023',
  null,
  'one character is not a search'
);

select throws_ok(
  $$ select support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, 'gam', 26
  ) $$,
  '22023',
  null,
  'nor is a page of more than twenty-five'
);

-- Every search is evidence -------------------------------------------------------------

select is(
  (select count(*) from support.metadata_queries
    where actor_person_id = '019f8000-0000-7000-8000-000000000001'
      and lookup_kind = 'text' and case_reference is null),
  10::bigint,
  'every search that ran is recorded, with no case when none was given'
);

select is(
  (select result_count from support.metadata_queries
    where lookup_hash = extensions.digest('example.te', 'sha256')),
  1,
  'with how many people it answered and a hash of what was asked, never the text'
);

select is(
  (select count(*) from privacy.access_events
    where actor_person_id = '019f8000-0000-7000-8000-000000000001'
      and resource = 'support.person_search'
      and subject_person_id = '019f8000-0000-7000-8000-000000000005'),
  5::bigint,
  'each person a search returned sees it in her history, once per search'
);

select is(
  (select count(*) from privacy.access_events
    where resource = 'support.person_search'
      and subject_person_id = '019f8000-0000-7000-8000-000000000006'),
  1::bigint,
  'and a person no search returned sees nothing'
);

-- A case is optional, and still traceable when given.
select is(
  (select support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      'CASE-2026-Q01', 'epsilon', 25
  ) #>> '{matches,0,display_name}'),
  'Epsilon Vega',
  'a search under a case answers the same'
);

select is(
  (select count(*) from support.metadata_queries where case_reference = 'CASE-2026-Q01'),
  1::bigint,
  'and is recorded under it'
);

select throws_ok(
  $$ select support.search_people(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      'una referencia libre', 'gam', 25
  ) $$,
  '22023',
  null,
  'a case given in free text is still refused'
);

select throws_ok(
  $$ select support.search_people(
      '019f8000-0000-7000-8000-000000000004', '019f8000-0000-7000-8000-000000000024',
      null, 'gam', 25
  ) $$,
  '42501',
  null,
  'a Backoffice session without the admin role finds nobody'
);

select is(
  (select count(*) from support.metadata_queries
    where actor_person_id = '019f8000-0000-7000-8000-000000000004'),
  0::bigint,
  'and its refused search reached nobody'
);

-- The other support reads without a case --------------------------------------------------

select is(
  (select support.person_metadata(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, '019f8000-0000-7000-8000-000000000003'
  ) - array[
      'person_id', 'account_status', 'created_at', 'activated_at', 'email_verified_at',
      'phone_verified_at', 'has_access_account', 'access_account_linked_at',
      'contact_email_masked', 'contact_phone_masked'
  ] ->> 'display_name'),
  'Gamma Ramírez',
  'her file opens without a case and names her'
);

select is(
  (select support.person_metadata(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      '', '019f8000-0000-7000-8000-000000000003'
  ) ->> 'contact_email'),
  'gamma@example.test',
  'with her full contact, and an empty case counts as none'
);

select throws_ok(
  $$ select support.person_metadata(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      'free text', '019f8000-0000-7000-8000-000000000003'
  ) $$,
  '22023',
  null,
  'a case given to the file in free text is refused'
);

select lives_ok(
  $$ select support.person_payments(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, '019f8000-0000-7000-8000-000000000003'
  ) $$,
  'what she pays opens without a case'
);

select lives_ok(
  $$ select support.billing_follow_up(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, 50
  ) $$,
  'the charges to follow up open without a case'
);

select is(
  (select identity.read_account_recovery(
      '019f8000-0000-7000-8000-000000000001', '019f8000-0000-7000-8000-000000000021',
      null, '019f8000-0000-7000-8000-000000000003'
  ) ->> 'person_id'),
  '019f8000-0000-7000-8000-000000000003',
  'and so does reading her recovery; starting one still needs a case'
);

select * from finish();
rollback;
