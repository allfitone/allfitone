-- HU-STUDIO-037 criterion 3: an activity type says which family of targets it takes.
--
-- A template step's target has to be of the family its activity type expects —
-- strength, endurance, interval or mobility — and `planning.session_content_errors`
-- refuses anything else with `target-family`. That family lives in the type's
-- effective default result contract, and the catalogue read never said it. A template
-- editor could only offer all four and learn the right one from a refusal.
--
-- `catalog.list_activity_types()` now answers it, through the same
-- `catalog.activity_type_target_family` the validator calls, so the two can never
-- disagree. A type with no default contract in force answers null: every target would
-- be refused there, and saying so is the honest answer, not a default.
--
-- The read is OP-CAT-008 on all three surfaces. The new column is additive, and the
-- function is dropped and created because a `returns table` cannot grow in place.

set lock_timeout = '5s';
set statement_timeout = '60s';

drop function catalog.list_activity_types();

create function catalog.list_activity_types()
returns table (
  id uuid,
  discipline_code text,
  code text,
  name text,
  activity_family catalog.activity_family
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  perform catalog.require_catalog_reader();
  return query
  select
    activity.id,
    activity.discipline_code,
    activity.code,
    activity.name,
    catalog.activity_type_target_family(activity.id)
  from catalog.activity_types as activity
  where activity.status = 'published'
    and activity.content_scope = 'global'
  order by activity.discipline_code, activity.code;
end
$function$;

alter function catalog.list_activity_types() owner to allfit_owner;
revoke all on function catalog.list_activity_types() from public;
grant execute on function catalog.list_activity_types() to allfit_api;
