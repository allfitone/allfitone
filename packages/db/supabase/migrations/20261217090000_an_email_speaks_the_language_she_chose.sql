-- An email speaks the language she chose (ADR-054 decision 8). TECH-44.
--
-- **One question, one answer.** `identity.email_locale_for_event` tells the worker which
-- language the email of an outbox event is written in: the `locale` of the person the event
-- is about, read through the same map the inbox and the email gate use
-- (`identity.resolve_notice_target`), and Spanish while she has chosen none. An event with
-- no person behind it, such as an invitation to an address nobody holds yet, is Spanish,
-- and so is an event outside the map.
--
-- **The code is hers like the change.** `identity.contact_changed.v1`, the code that
-- confirms a new email, is not a notice and stays out of the map. Its language is that of
-- the person whose request it names, the one `identity.contact_verified.v1` resolves.
--
-- **Read through her scope.** The function opens `notice_recipient` for her alone, and a
-- new policy lets that scope read her preferences and nobody else's. Only the worker asks,
-- and it learns a language, never the row.
--
-- Additive, forward-only over `20261216090000`.

set lock_timeout = '5s';
set statement_timeout = '60s';

create policy person_preferences_select_notice_recipient on identity.person_preferences
  for select to allfit_owner
  using (person_id::text = (select access_control.contract_scope('notice_recipient')));

create function identity.email_locale_for_event(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  saved_purpose text := current_setting('app.contract_scope_purpose', true);
  saved_id text := current_setting('app.contract_scope_id', true);
  saved_token text := current_setting('app.contract_scope_token', true);
  event record;
  target record;
  chosen text;
begin
  if access_control.actor_kind() is distinct from 'worker' then
    raise exception 'only the worker asks which language an email is written in' using errcode = '42501';
  end if;

  select outbox.event_type, outbox.payload into event
  from system.outbox_events as outbox
  where outbox.id = p_event_id;
  if event.event_type is null then
    return 'es';
  end if;

  select * into target from identity.resolve_notice_target(
    case event.event_type
      when 'identity.contact_changed.v1' then 'identity.contact_verified.v1'
      else event.event_type
    end,
    event.payload);

  if target.recipient is not null then
    perform access_control.open_contract_scope('notice_recipient', target.recipient);
    select preference.locale into chosen
    from identity.person_preferences as preference
    where preference.person_id = target.recipient;
  end if;

  perform set_config('app.contract_scope_purpose', coalesce(saved_purpose, ''), true);
  perform set_config('app.contract_scope_id', coalesce(saved_id, ''), true);
  perform set_config('app.contract_scope_token', coalesce(saved_token, ''), true);
  return coalesce(chosen, 'es');
end
$function$;

alter function identity.email_locale_for_event(uuid) owner to allfit_owner;

revoke all on function identity.email_locale_for_event(uuid) from public;

grant execute on function identity.email_locale_for_event(uuid) to allfit_api;
