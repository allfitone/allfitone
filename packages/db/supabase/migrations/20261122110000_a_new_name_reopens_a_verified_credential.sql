-- HU-BO-021 criterion 7: a new name reopens the review of a verified credential, and
-- the earlier verification stays intact.
--
-- Since TECH-43 a person corrects her own name from Space (`identity.correct_own_name`,
-- `20261121090000`). A credential verified against her old name kept reading as
-- verified, and nobody looked again, although the verification was about her by name.
--
-- **The queue fills itself, as it already did.** Declaring a credential opens its review
-- and retiring it withdraws it (`20260913120000`). Changing her name now opens one more
-- kind of review, `name_change`, for each active credential whose latest verification is
-- `verified` and still in force, superseding the request that verified it. Nobody has to
-- remember to ask.
--
-- **The verification is never touched.** It stays in force while the review is pending:
-- criterion 7 says a name change does not modify the verification, and only the reviewer
-- can tell whether the credential still matches. A lapsed verification is renewed, not
-- reopened; a credential already under review gets no second review; and a change that
-- leaves the name as it was opens nothing.

set lock_timeout = '5s';
set statement_timeout = '60s';

alter table identity.credential_verification_requests
  drop constraint ck_credential_verification_requests_kind,
  add constraint ck_credential_verification_requests_kind check (
    kind in ('initial', 'renewal', 'name_change')
  );

create function identity.open_name_change_review_tg()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  insert into identity.credential_verification_requests (
    professional_credential_id, requested_by_person_id, kind, supersedes_request_id
  )
  select credential.id, new.id, 'name_change', latest.request_id
  from identity.professional_profiles as profile
  join identity.professional_credentials as credential
    on credential.professional_profile_id = profile.id and credential.status = 'active'
  cross join lateral (
    select verification.result, verification.valid_to, verification.request_id
    from identity.professional_credential_verifications as verification
    where verification.professional_credential_id = credential.id
    order by verification.decided_at desc, verification.id desc
    limit 1
  ) as latest
  where profile.person_id = new.id
    and latest.result = 'verified'
    and latest.valid_to > clock_timestamp()
    -- One review in progress per credential, the rule the pending index also enforces.
    and not exists (
      select 1
      from identity.credential_verification_requests as pending
      where pending.professional_credential_id = credential.id
        and pending.status = 'pending'
    );
  return new;
end
$function$;

alter function identity.open_name_change_review_tg() owner to allfit_owner;
revoke all on function identity.open_name_change_review_tg() from public;

create trigger trg_people_open_name_change_review
after update of given_name, family_name on identity.people
for each row
when ((old.given_name, old.family_name) is distinct from (new.given_name, new.family_name))
execute function identity.open_name_change_review_tg();
