-- A person decides whether the assistant may use her data: the AI consent
-- (`OP-ITL-001`, `OP-ITL-002`, `OP-ITL-003`; HU-SP-124 and HU-SP-125; ADR-053, decision 4).
--
-- **The first objects of `intelligence`.** The assistant is one domain for Space and
-- Studio, and this is the one thing every capability of it needs before it may send
-- anything to a model. Runs, ceilings and summaries arrive with the capability that
-- writes them (ADR-021): nothing here asks a model.
--
-- **A consent of the person to the platform, not a grant.** `privacy.consent_events`
-- records what a person decided about an organisation, scope by scope. This is another
-- thing: one question, asked once, about her data reaching a model at all. An
-- organisation receives nothing by it, so it carries no relationship and no scope.
--
-- **One consent is in force for a person, or none.** Accepting a later text ends the
-- earlier one as `replaced`; withdrawing ends it as `withdrawn`; giving it back writes a
-- new row. A unique index holds the «one», and each command takes the person's lock so
-- two of them cannot both read «none in force».
--
-- **History is kept by the table, not by the grants.** A consent is never deleted, and
-- the only change a row admits is its end, once. `privacy.access_events` learned why:
-- immutability that rests on nobody holding a privilege is not immutability.
--
-- **No text is published here.** A version is a text a person read, and the text of this
-- consent does not exist yet (ADR-053, open questions). Until a migration publishes one,
-- no consent can be given and no capability can run: it fails closed.
--
-- **Nothing is readable by the runtime role.** The API reaches the tables only through
-- the three functions below, and each answers only to the person herself.
--
-- Additive.

set lock_timeout = '5s';
set statement_timeout = '60s';

create schema if not exists intelligence authorization allfit_owner;

revoke all on schema intelligence from public;
grant usage on schema intelligence to allfit_api;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table intelligence.consent_versions (
  version text not null,
  published_at timestamp with time zone not null default clock_timestamp(),
  constraint pk_consent_versions primary key (version),
  constraint ck_consent_versions_version check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);

create table intelligence.consents (
  id uuid not null default extensions.uuid_generate_v7(),
  person_id uuid not null,
  text_version text not null,
  accepted_at timestamp with time zone not null default clock_timestamp(),
  ended_at timestamp with time zone,
  end_reason text,
  constraint pk_consents primary key (id),
  constraint fk_consents_person foreign key (person_id) references identity.people (id) on delete restrict,
  constraint fk_consents_version foreign key (text_version) references intelligence.consent_versions (version) on delete restrict,
  constraint ck_consents_end_reason check (end_reason in ('replaced', 'withdrawn')),
  constraint ck_consents_end_pair check ((ended_at is null) = (end_reason is null)),
  constraint ck_consents_end_order check (ended_at is null or ended_at >= accepted_at)
);

create unique index uidx_consents_in_force on intelligence.consents (person_id) where ended_at is null;
create index idx_consents_person on intelligence.consents (person_id, accepted_at desc);

alter table intelligence.consent_versions owner to allfit_owner;
alter table intelligence.consents owner to allfit_owner;

revoke all on intelligence.consent_versions from public, allfit_api;
revoke all on intelligence.consents from public, allfit_api;

alter table intelligence.consent_versions enable row level security;
alter table intelligence.consent_versions force row level security;
alter table intelligence.consents enable row level security;
alter table intelligence.consents force row level security;

create policy consent_versions_select_all on intelligence.consent_versions
  for select to allfit_owner using (true);
create policy consents_select_self on intelligence.consents
  for select to allfit_owner using (access_control.is_self(person_id));
create policy consents_insert_self on intelligence.consents
  for insert to allfit_owner with check (access_control.is_self(person_id));
create policy consents_update_self on intelligence.consents
  for update to allfit_owner
  using (access_control.is_self(person_id))
  with check (access_control.is_self(person_id));

-- ---------------------------------------------------------------------------
-- History
-- ---------------------------------------------------------------------------

create function intelligence.reject_consent_rewrite()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  -- The one change a consent admits: it ends, once, and nothing else of it moves.
  if tg_op = 'UPDATE'
     and old.ended_at is null and new.ended_at is not null
     and new.id = old.id and new.person_id = old.person_id
     and new.text_version = old.text_version and new.accepted_at = old.accepted_at then
    return new;
  end if;
  raise exception 'intelligence.consents keeps its history: a consent only ends, once'
    using errcode = '42501';
end
$function$;

create trigger trg_consents_reject_rewrite
before update or delete on intelligence.consents
for each row execute function intelligence.reject_consent_rewrite();

-- ---------------------------------------------------------------------------
-- Read (OP-ITL-003)
-- ---------------------------------------------------------------------------

create function intelligence.read_consent(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  in_force record;
  last_withdrawal timestamp with time zone;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    return null;
  end if;

  select text_version, accepted_at into in_force
  from intelligence.consents
  where person_id = p_person_id and ended_at is null;
  if found then
    return jsonb_build_object(
      'accepted_version', in_force.text_version,
      'accepted_at', in_force.accepted_at,
      'withdrawn_at', null);
  end if;

  select max(ended_at) into last_withdrawal
  from intelligence.consents
  where person_id = p_person_id and end_reason = 'withdrawn';
  return jsonb_build_object(
    'accepted_version', null, 'accepted_at', null, 'withdrawn_at', last_withdrawal);
end
$function$;

-- ---------------------------------------------------------------------------
-- Give (OP-ITL-001)
-- ---------------------------------------------------------------------------

create function intelligence.give_consent(
  p_person_id uuid,
  p_version text,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  held record;
  consent_id uuid;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'consent person does not match the authenticated actor' using errcode = '42501';
  end if;
  if not exists (select 1 from intelligence.consent_versions where version = p_version) then
    raise exception 'unknown consent text version' using errcode = '22023';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-ITL-001', p_idempotency_key, p_command_id, p_request_hash
  );
  if receipt.claimed then
    perform pg_advisory_xact_lock(hashtextextended('intelligence.consents:' || p_person_id::text, 0));

    select id, text_version into held
    from intelligence.consents
    where person_id = p_person_id and ended_at is null;

    if found and held.text_version = p_version then
      -- She already holds this text: there is nothing to write.
      consent_id := held.id;
    else
      if found then
        update intelligence.consents
        set ended_at = clock_timestamp(), end_reason = 'replaced'
        where id = held.id;
      end if;
      insert into intelligence.consents (id, person_id, text_version)
      values (p_command_id, p_person_id, p_version);
      consent_id := p_command_id;
    end if;

    perform system.finish_idempotency(
      receipt.receipt_id, 200::smallint, 'consent-given', 'intelligence_consent', consent_id);
  end if;

  return intelligence.read_consent(p_person_id);
end
$function$;

-- ---------------------------------------------------------------------------
-- Withdraw (OP-ITL-002)
-- ---------------------------------------------------------------------------

create function intelligence.withdraw_consent(
  p_person_id uuid,
  p_idempotency_key uuid,
  p_command_id uuid,
  p_request_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  receipt record;
  ended_id uuid;
begin
  if access_control.actor_kind() is distinct from 'person'
     or access_control.person() is distinct from p_person_id then
    raise exception 'consent person does not match the authenticated actor' using errcode = '42501';
  end if;

  select * into receipt from system.begin_idempotency(
    p_person_id, 'OP-ITL-002', p_idempotency_key, p_command_id, p_request_hash
  );
  if receipt.claimed then
    perform pg_advisory_xact_lock(hashtextextended('intelligence.consents:' || p_person_id::text, 0));

    update intelligence.consents
    set ended_at = clock_timestamp(), end_reason = 'withdrawn'
    where person_id = p_person_id and ended_at is null
    returning id into ended_id;

    -- Nothing in force is still an answer: the command stands for itself.
    perform system.finish_idempotency(
      receipt.receipt_id, 200::smallint, 'consent-withdrawn', 'intelligence_consent',
      coalesce(ended_id, p_command_id));
  end if;

  return intelligence.read_consent(p_person_id);
end
$function$;

-- ---------------------------------------------------------------------------
-- Ownership and privileges
-- ---------------------------------------------------------------------------

alter function intelligence.reject_consent_rewrite() owner to allfit_owner;
alter function intelligence.read_consent(uuid) owner to allfit_owner;
alter function intelligence.give_consent(uuid, text, uuid, uuid, bytea) owner to allfit_owner;
alter function intelligence.withdraw_consent(uuid, uuid, uuid, bytea) owner to allfit_owner;

revoke all on function intelligence.reject_consent_rewrite() from public, allfit_api;
revoke all on function intelligence.read_consent(uuid) from public;
revoke all on function intelligence.give_consent(uuid, text, uuid, uuid, bytea) from public;
revoke all on function intelligence.withdraw_consent(uuid, uuid, uuid, bytea) from public;

grant execute on function intelligence.read_consent(uuid) to allfit_api;
grant execute on function intelligence.give_consent(uuid, text, uuid, uuid, bytea) to allfit_api;
grant execute on function intelligence.withdraw_consent(uuid, uuid, uuid, bytea) to allfit_api;
