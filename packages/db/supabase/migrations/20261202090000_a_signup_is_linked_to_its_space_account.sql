-- A waitlist sign-up is linked to its Allfit Space account, and a Founding Member number
-- becomes the person's (`OP-WL-006`; HU-SP-119; ADR-050, decisions 5 and 7; TECH-299).
--
-- **When.** A sign-up has an account when its person finishes the onboarding, not when the
-- name is given: somebody who leaves halfway has accepted nothing yet. `identity` writes
-- `identity.person_activated.v1` in the transaction that activates the person, and the
-- worker takes it from there. Neither domain writes the other's tables: the worker reads
-- the person and her verified email from `identity`, and hands both to `waitlist`.
--
-- **How it is found.** By the canonical email, the same rule that keeps one sign-up per
-- mailbox. A sign-up that never confirmed is confirmed at that moment: the account's
-- verified email proves what the confirmation link would have.
--
-- **The store.** The app says which store its phone uses when it completes the
-- onboarding. `identity` keeps it on the attempt and the link copies it to the sign-up,
-- because a referral reward is an offer code of that store (HU-SP-121).
--
-- **The number stops moving.** Once linked, the number is copied to the person through
-- `identity`'s own function and written down as settled. A settled number is never given
-- again, whatever happens to the sign-up afterwards: it leaves the list, the list is
-- deleted, or the account is. A fraud mark no longer takes it either; it only stops the
-- sign-up from counting for whoever invited it.
--
-- **What the Backoffice reads.** «Con cuenta» now says whether the sign-up is linked, and
-- the totals count the linked ones (HU-BO-035, criterion 4).
--
-- **Not here.** Deleting an Allfit Space account does not exist yet. The foreign key
-- cascades so that, when it does, the sign-up goes with the person; the settled number
-- stays, which is what «nobody inherits it» asks for.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- identity — the store, the event and the number on the person
-- ---------------------------------------------------------------------------

alter table identity.onboarding_attempts
  add column activation_store text,
  add constraint ck_onboarding_attempts_activation_store check (activation_store in ('app_store', 'google_play'));

comment on column identity.onboarding_attempts.activation_store is
  'The store of the phone the onboarding was completed on. Null on the web.';

alter table identity.people
  add column founding_member_number smallint,
  add constraint ck_people_founding_member_number check (founding_member_number between 1 and 100);

create unique index uidx_people_founding_member_number
  on identity.people (founding_member_number)
  where founding_member_number is not null;

comment on column identity.people.founding_member_number is
  'Founding Member number, copied from the waitlist at linking. It goes with the person.';

-- The answer gains a parameter, which `create or replace` cannot do. Nine arguments still
-- resolve to it, so Studio and every caller that sends no store are untouched.
drop function identity.activate_person(uuid, uuid, text, text, boolean, boolean, uuid, uuid, bytea);

create function identity.activate_person(
  p_account_id uuid,
  p_attempt_id uuid,
  p_given_name text,
  p_family_name text,
  p_terms_accepted boolean,
  p_privacy_notice_accepted boolean,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea,
  p_store text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  account_person_id uuid;
  person_status identity.person_status;
  attempt identity.onboarding_attempts%rowtype;
  result_person_id uuid;
  eligibility identity.eligibility_result;
begin
  if access_control.actor_kind() <> 'account' or access_control.account() <> p_account_id then
    raise exception 'onboarding account does not match the authenticated actor' using errcode = '42501';
  end if;
  if not p_terms_accepted or not p_privacy_notice_accepted then
    raise exception 'legal acceptances are required' using errcode = '23514';
  end if;
  if p_store is not null and p_store not in ('app_store', 'google_play') then
    raise exception 'unknown store' using errcode = '22023';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_account_id,
    'OP-IDN-003',
    p_idempotency_key,
    p_command_id,
    p_request_hash
  );

  if not receipt.claimed then
    return receipt.aggregate_id;
  end if;

  select access_account.person_id into account_person_id
  from identity.access_accounts as access_account
  where access_account.id = p_account_id
  for update;

  if not found then
    raise exception 'access account does not exist' using errcode = '42501';
  end if;

  select * into attempt
  from identity.onboarding_attempts
  where id = p_attempt_id
    and account_id = p_account_id
  for update;

  if attempt.id is null then
    raise exception 'onboarding attempt is not owned by the account' using errcode = '42501';
  end if;

  if account_person_id is not null then
    if attempt.person_id is not null and attempt.person_id <> account_person_id then
      raise exception 'access account is linked to a different person' using errcode = '23514';
    end if;

    select people.status into person_status
    from identity.people as people
    where people.id = account_person_id
    for update;

    result_person_id := account_person_id;

    -- Already active: idempotent, and activated_at is never re-stamped.
    if person_status = 'pending_activation' then
      if attempt.status <> 'open' or attempt.expires_at <= clock_timestamp() then
        raise exception 'onboarding attempt is not open' using errcode = '23514';
      end if;

      select evidence.result into eligibility
      from identity.eligibility_evidence as evidence
      where evidence.onboarding_attempt_id = p_attempt_id
      order by evidence.evaluated_at desc, evidence.id desc
      limit 1;

      if eligibility is distinct from 'pass' then
        raise exception 'adult eligibility is required' using errcode = '23514';
      end if;

      update identity.people
      set status = 'active',
          activated_at = clock_timestamp()
      where id = result_person_id;

      update identity.onboarding_attempts
      set status = 'activated',
          terms_version = 'platform_terms_v1',
          terms_accepted_at = clock_timestamp(),
          privacy_notice_version = 'privacy_notice_v1',
          privacy_notice_accepted_at = clock_timestamp(),
          activation_store = p_store
      where id = p_attempt_id;

      perform system.enqueue_outbox_event(
        'person', result_person_id, 'identity.person_activated.v1',
        jsonb_build_object('person_id', result_person_id)
      );
    end if;
  else
    -- Studio: the provider brought the name and there is no person yet, so this
    -- call both creates and activates, exactly as it did before.
    if btrim(p_given_name) = '' or btrim(p_family_name) = '' then
      raise exception 'given name and family name are required' using errcode = '22023';
    end if;
    if attempt.status <> 'open' or attempt.expires_at <= clock_timestamp() then
      raise exception 'onboarding attempt is not open' using errcode = '23514';
    end if;

    select evidence.result into eligibility
    from identity.eligibility_evidence as evidence
    where evidence.onboarding_attempt_id = p_attempt_id
    order by evidence.evaluated_at desc, evidence.id desc
    limit 1;

    if eligibility is distinct from 'pass' then
      raise exception 'adult eligibility is required' using errcode = '23514';
    end if;

    insert into identity.people (given_name, family_name, status, activated_at)
    values (btrim(p_given_name), btrim(p_family_name), 'active', clock_timestamp())
    returning id into result_person_id;

    update identity.access_accounts
    set person_id = result_person_id
    where id = p_account_id
      and person_id is null;

    if not found then
      raise exception 'access account was linked concurrently' using errcode = '40001';
    end if;

    update identity.onboarding_attempts
    set person_id = result_person_id,
        status = 'activated',
        terms_version = 'platform_terms_v1',
        terms_accepted_at = clock_timestamp(),
        privacy_notice_version = 'privacy_notice_v1',
        privacy_notice_accepted_at = clock_timestamp(),
        activation_store = p_store
    where id = p_attempt_id;

    perform system.enqueue_outbox_event(
      'person', result_person_id, 'identity.person_activated.v1',
      jsonb_build_object('person_id', result_person_id)
    );
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id,
    200::smallint,
    'person-activated',
    'person',
    result_person_id
  );
  return result_person_id;
end
$function$;

-- What the worker needs to link an activated person: who she is and her verified email.
create function identity.prepare_account_link(p_event_id uuid)
returns table (link_state text, person_id uuid, verified_email text, store text)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;

  return query
    select 'ready'::text, owner.id, owner.contact_email::text, (
             select attempt.activation_store
             from identity.onboarding_attempts as attempt
             where attempt.person_id = owner.id
               and attempt.status = 'activated'
             order by attempt.terms_accepted_at desc, attempt.id desc
             limit 1
           )
    from system.outbox_events as outbox
    join identity.people as owner on owner.id = outbox.aggregate_id
    where outbox.id = p_event_id
      and outbox.event_type = 'identity.person_activated.v1'
      and outbox.aggregate_type = 'person'
      and owner.status = 'active'
      and owner.contact_email_verified_at is not null;

  -- A person activated in Studio has no contact email: there is nothing to look up by.
  if not found then
    return query select 'skipped'::text, null::uuid, null::text, null::text;
  end if;
end
$function$;

-- The only writer of the number. Giving the same number again changes nothing.
create function identity.record_founding_number(p_person_id uuid, p_number smallint)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  update identity.people as owner
  set founding_member_number = p_number
  where owner.id = p_person_id
    and (owner.founding_member_number is null or owner.founding_member_number = p_number);

  if not found then
    raise exception 'the person cannot take this Founding Member number' using errcode = '23514';
  end if;
end
$function$;

-- The person reads her number with the rest of her identity (`OP-IDN-012`).
create or replace function identity.read_own_identity(p_provider text, p_issuer text, p_subject text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  person uuid;
begin
  person := identity.require_space_person(p_provider, p_issuer, p_subject);

  return (
    select jsonb_build_object(
      'given_name', owner.given_name,
      'family_name', owner.family_name,
      'username', owner.username::text,
      'active_since', owner.activated_at,
      'founding_member_number', owner.founding_member_number,
      'email', jsonb_build_object(
        'address', owner.contact_email::text,
        'verified', owner.contact_email_verified_at is not null,
        'pending', coalesce(identity.own_email_change_document(owner.id), 'null'::jsonb)
      ),
      'phone', jsonb_build_object(
        'number', owner.contact_phone,
        'verified', owner.contact_phone_verified_at is not null
      ),
      'accounts', coalesce((
        select jsonb_agg(
                 jsonb_build_object('provider', account.provider, 'linked_at', account.linked_at)
                 order by account.linked_at, account.id
               )
        from identity.access_accounts as account
        where account.person_id = owner.id
      ), '[]'::jsonb)
    )
    from identity.people as owner
    where owner.id = person
  );
end
$function$;

-- ---------------------------------------------------------------------------
-- waitlist — the link
-- ---------------------------------------------------------------------------

alter table waitlist.signups
  add column person_id uuid,
  add column linked_at timestamptz,
  add column store text,
  add constraint fk_signups_person foreign key (person_id) references identity.people (id) on delete cascade,
  add constraint ck_signups_link check ((person_id is null) = (linked_at is null)),
  add constraint ck_signups_linked_confirmed check (person_id is null or confirmed_at is not null),
  add constraint ck_signups_store check (store in ('app_store', 'google_play')),
  add constraint ck_signups_store_linked check (store is null or person_id is not null);

-- One sign-up per person, as there is one per mailbox.
create unique index uidx_signups_person
  on waitlist.signups (person_id)
  where person_id is not null;

comment on column waitlist.signups.person_id is
  'The person whose Allfit Space account this sign-up was linked to. Deleted with her.';
comment on column waitlist.signups.store is
  'The store of the phone the account was created on: which offer code a reward is.';

-- A number that reached a person. It holds no person, so it outlives sign-up and account.
create table waitlist.settled_founding_numbers (
  founding_number smallint not null,
  settled_at timestamptz not null default clock_timestamp(),
  constraint pk_settled_founding_numbers primary key (founding_number),
  constraint ck_settled_founding_numbers_number check (founding_number between 1 and 100)
);

alter table waitlist.settled_founding_numbers owner to allfit_owner;
alter table waitlist.settled_founding_numbers enable row level security;
alter table waitlist.settled_founding_numbers force row level security;

create policy settled_founding_numbers_all_owner on waitlist.settled_founding_numbers
  for all to allfit_owner using (true) with check (true);

revoke all on waitlist.settled_founding_numbers from public, allfit_api;

comment on table waitlist.settled_founding_numbers is
  'Founding Member numbers that belong to a person. Never given again, to anybody.';

-- Makes a linked sign-up's number the person's. Without a person or a number, nothing.
create function waitlist.settle_founding_number(p_signup_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  holder uuid;
  held smallint;
begin
  select signup.person_id, signup.founding_number into holder, held
  from waitlist.signups as signup
  where signup.id = p_signup_id;
  if holder is null or held is null then
    return;
  end if;

  insert into waitlist.settled_founding_numbers (founding_number)
  values (held)
  on conflict (founding_number) do nothing;

  perform identity.record_founding_number(holder, held);
end
$function$;

-- A free number is one that no sign-up holds and that never reached a person.
create or replace function waitlist.fill_founding_numbers()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  free_number smallint;
  next_id uuid;
  given_id uuid;
  given integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('waitlist.founding_numbers', 0));

  loop
    select candidate.number::smallint into free_number
    from generate_series(1, 100) as candidate(number)
    where not exists (
      select 1 from waitlist.signups as holder where holder.founding_number = candidate.number
    ) and not exists (
      select 1 from waitlist.settled_founding_numbers as settled
      where settled.founding_number = candidate.number
    )
    order by candidate.number
    limit 1;
    exit when free_number is null;

    select signup.id into next_id
    from waitlist.signups as signup
    where signup.confirmed_at is not null
      and signup.founding_number is null
      and signup.discard_reason is distinct from 'fraud'
    order by signup.confirmed_at, signup.id
    limit 1;
    exit when next_id is null;

    update waitlist.signups as signup
    set founding_number = free_number,
        founding_assigned_at = clock_timestamp()
    where signup.id = next_id
      and signup.founding_number is null
      and signup.confirmed_at is not null
      and signup.discard_reason is distinct from 'fraud'
    returning signup.id into given_id;
    continue when given_id is null;

    perform system.enqueue_outbox_event(
      'waitlist_signup', given_id, 'waitlist.founding_number_assigned.v1',
      jsonb_build_object('founding_number', free_number)
    );
    -- A sign-up that already has its account keeps the number from the first moment.
    perform waitlist.settle_founding_number(given_id);
    given := given + 1;
  end loop;

  return given;
end
$function$;

-- ---------------------------------------------------------------------------
-- OP-WL-006 — link a sign-up to the account created with its email
-- ---------------------------------------------------------------------------

create function waitlist.link_signup(p_person_id uuid, p_email text, p_store text)
returns table (outcome text, founding_number smallint)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  canonical text := waitlist.canonical_email(p_email);
  target waitlist.signups%rowtype;
  observed_at timestamptz := clock_timestamp();
begin
  if access_control.actor_kind() <> 'worker' then
    raise exception 'worker actor required' using errcode = '42501';
  end if;
  if p_person_id is null or canonical is null
     or (p_store is not null and p_store not in ('app_store', 'google_play')) then
    raise exception 'invalid waitlist link' using errcode = '22023';
  end if;

  select signup.* into target
  from waitlist.signups as signup
  where signup.canonical_email = canonical
  for update;

  if target.id is null then
    return query select 'no_signup'::text, null::smallint;
    return;
  end if;
  if target.person_id = p_person_id then
    return query select 'already_linked'::text, target.founding_number;
    return;
  end if;
  -- Two addresses of one mailbox are two accounts and one sign-up: the first one has it.
  if target.person_id is not null or exists (
       select 1 from waitlist.signups as other where other.person_id = p_person_id
     ) then
    return query select 'conflict'::text, null::smallint;
    return;
  end if;

  update waitlist.signups as signup
  set person_id = p_person_id,
      linked_at = observed_at,
      store = p_store,
      confirmed_at = coalesce(signup.confirmed_at, observed_at)
  where signup.id = target.id;

  -- The account's verified email confirmed it, so it is news exactly as a confirmation is.
  if target.confirmed_at is null then
    perform waitlist.fill_founding_numbers();
    perform system.enqueue_outbox_event(
      'waitlist_signup', target.id, 'waitlist.signup_confirmed.v1',
      jsonb_build_object(
        'confirmed_total', (
          select count(*)
          from waitlist.signups as signup
          where signup.confirmed_at is not null
        )
      )
    );
  end if;

  perform waitlist.settle_founding_number(target.id);

  return query
    select 'linked'::text, signup.founding_number
    from waitlist.signups as signup
    where signup.id = target.id;
end
$function$;

-- ---------------------------------------------------------------------------
-- What the Backoffice reads, and what a fraud mark takes
-- ---------------------------------------------------------------------------

create or replace function waitlist.backoffice_signup_projection(p_signup_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'id', signup.id,
    'name', signup.name,
    'email', signup.email::text,
    'language', signup.language,
    'referral_code', signup.referral_code,
    'joined_at', signup.created_at,
    'confirmed_at', signup.confirmed_at,
    'founding_number', signup.founding_number,
    'channel', waitlist.signup_channel(signup.utm_source, signup.invited_by_signup_id is not null),
    'invited_by', (
      select jsonb_build_object('name', inviter.name, 'referral_code', inviter.referral_code)
      from waitlist.signups as inviter
      where inviter.id = signup.invited_by_signup_id
    ),
    'discard_reason', signup.discard_reason,
    -- The mark that stands, or the withdrawal of the last one: never both.
    'fraud', (
      select jsonb_build_object(
        'reason', event.reason, 'marked_at', event.occurred_at,
        'previous_discard_reason', event.previous_discard_reason
      )
      from waitlist.signup_events as event
      where event.signup_id = signup.id
        and event.event_type = 'waitlist.signup_marked_as_fraud.v1'
        and signup.discard_reason = 'fraud'
      order by event.occurred_at desc, event.id desc
      limit 1
    ),
    'fraud_withdrawal', (
      select jsonb_build_object('reason', event.reason, 'withdrawn_at', event.occurred_at)
      from waitlist.signup_events as event
      where event.signup_id = signup.id
        and event.event_type = 'waitlist.signup_fraud_mark_withdrawn.v1'
        and signup.discard_reason is distinct from 'fraud'
      order by event.occurred_at desc, event.id desc
      limit 1
    ),
    'has_space_account', signup.person_id is not null,
    'referrals', waitlist.referral_count(signup.id),
    -- Referrals whose connection is this sign-up's own, or another referral's.
    'referrals_sharing_connection', (
      select count(*)::integer
      from waitlist.signups as invited
      where invited.invited_by_signup_id = signup.id
        and (
          invited.connection_hash = signup.connection_hash
          or exists (
            select 1
            from waitlist.signups as other
            where other.invited_by_signup_id = signup.id
              and other.id <> invited.id
              and other.connection_hash = invited.connection_hash
          )
        )
    )
  )
  from waitlist.signups as signup
  where signup.id = p_signup_id
$function$;

create or replace function waitlist.read_backoffice_totals(
  p_actor_person_id uuid,
  p_actor_session_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  perform waitlist.require_waitlist_reviewer(p_actor_person_id, p_actor_session_id);

  return (
    with by_channel as (
      select waitlist.signup_channel(signup.utm_source, signup.invited_by_signup_id is not null)
               as channel,
             count(*)::integer as signups,
             count(signup.confirmed_at)::integer as confirmed
      from waitlist.signups as signup
      group by 1
    ),
    ranked as (
      select by_channel.*,
             row_number() over (
               order by by_channel.signups desc, by_channel.channel ->> 'kind',
                        by_channel.channel ->> 'source'
             ) as position
      from by_channel
    ),
    folded as (
      select case
               when ranked.position <= 20 then ranked.channel
               else jsonb_build_object('kind', 'other', 'source', null)
             end as channel,
             sum(ranked.signups)::integer as signups,
             sum(ranked.confirmed)::integer as confirmed,
             min(ranked.position) as position
      from ranked
      group by 1
    )
    select jsonb_build_object(
      'signups', (select count(*)::integer from waitlist.signups),
      'confirmed', (
        select count(*)::integer from waitlist.signups as signup
        where signup.confirmed_at is not null
      ),
      'founding_members', (
        select count(*)::integer from waitlist.signups as signup
        where signup.founding_number is not null
      ),
      'marked_as_fraud', (
        select count(*)::integer from waitlist.signups as signup
        where signup.discard_reason = 'fraud'
      ),
      'with_account', (
        select count(*)::integer from waitlist.signups as signup
        where signup.person_id is not null
      ),
      'channels', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'channel', folded.channel, 'signups', folded.signups, 'confirmed', folded.confirmed
          )
          order by folded.position
        )
        from folded
      ), '[]'::jsonb)
    )
  );
end
$function$;

-- A linked sign-up keeps its number: the mark only stops it counting for its inviter.
create or replace function waitlist.mark_signup_as_fraud(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_signup_id uuid,
  p_reason text,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns table (result jsonb, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  duty_id uuid;
  receipt record;
  target waitlist.signups%rowtype;
  reason text := btrim(p_reason);
  released smallint;
begin
  duty_id := waitlist.require_waitlist_reviewer(p_actor_person_id, p_actor_session_id);

  if reason is null or char_length(reason) < 4 or char_length(reason) > 200
     or reason ~ '[[:cntrl:]]' then
    raise exception 'a sign-up is marked as fraud with a reason' using errcode = '22023';
  end if;

  -- Locked before its state is read, so two people marking at once leave one record.
  select signup.* into target
  from waitlist.signups as signup
  where signup.id = p_signup_id
  for update;
  if target.id is null then
    raise exception 'waitlist sign-up not found' using errcode = 'P0002';
  end if;

  select * into receipt
  from system.begin_idempotency(
    p_actor_person_id, 'backoffice'::system.command_surface, 'backoffice',
    'OP-WL-012', p_idempotency_key, p_command_id, p_request_hash
  );
  if not receipt.claimed then
    if receipt.aggregate_id is null then
      raise exception 'idempotent fraud mark not found' using errcode = '40001';
    end if;
    return query select waitlist.backoffice_signup_projection(receipt.aggregate_id), true;
    return;
  end if;

  if target.discard_reason = 'fraud' then
    raise exception 'the sign-up is already marked as fraud' using errcode = '55000';
  end if;

  -- With an account the number is the person's and does not move (ADR-050, decision 5).
  released := case when target.person_id is null then target.founding_number end;

  update waitlist.signups
  set discard_reason = 'fraud',
      founding_number = case when released is null then founding_number end,
      founding_assigned_at = case when released is null then founding_assigned_at end
  where id = p_signup_id;

  insert into waitlist.signup_events (
    signup_id, event_type, reason, previous_discard_reason, released_founding_number,
    actor_person_id, actor_duty_assignment_id
  ) values (
    p_signup_id, 'waitlist.signup_marked_as_fraud.v1', reason, target.discard_reason,
    released, p_actor_person_id, duty_id
  );

  -- Only a holder frees a number. A sign-up without one is never waited on by the fill.
  if released is not null then
    perform waitlist.fill_founding_numbers();
  end if;

  perform system.finish_idempotency(
    receipt.receipt_id, 200::smallint, 'waitlist-signup-marked-as-fraud',
    'waitlist_signup', p_signup_id
  );
  return query select waitlist.backoffice_signup_projection(p_signup_id), false;
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and grants
-- ---------------------------------------------------------------------------

alter function identity.activate_person(uuid, uuid, text, text, boolean, boolean, uuid, uuid, bytea, text)
  owner to allfit_owner;
alter function identity.prepare_account_link(uuid) owner to allfit_owner;
alter function identity.record_founding_number(uuid, smallint) owner to allfit_owner;
alter function waitlist.settle_founding_number(uuid) owner to allfit_owner;
alter function waitlist.link_signup(uuid, text, text) owner to allfit_owner;

revoke all on function identity.activate_person(uuid, uuid, text, text, boolean, boolean, uuid, uuid, bytea, text)
  from public;
revoke all on function identity.prepare_account_link(uuid) from public;
revoke all on function identity.record_founding_number(uuid, smallint) from public, allfit_api;
revoke all on function waitlist.settle_founding_number(uuid) from public, allfit_api;
revoke all on function waitlist.link_signup(uuid, text, text) from public;

grant execute on function identity.activate_person(uuid, uuid, text, text, boolean, boolean, uuid, uuid, bytea, text)
  to allfit_api;
grant execute on function identity.prepare_account_link(uuid) to allfit_api;
grant execute on function waitlist.link_signup(uuid, text, text) to allfit_api;
