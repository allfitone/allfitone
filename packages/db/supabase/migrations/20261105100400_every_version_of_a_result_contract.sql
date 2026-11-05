-- NEW-CAT-CONTRACT-VERSIONS — every version of an activity type's result contracts, as
-- its curator sees them (`HU-BO-023`).
--
-- The publication screen listed only the versions in force, through the product read
-- `catalog.list_activity_type_result_contracts`. A deprecated version vanished from it,
-- and one published last week could not be deprecated from anywhere: the deprecation
-- command took any version, but nothing listed one to take.
--
-- **Every version, published and deprecated, newest first.** Each travels as the
-- publication answered it (`catalog.result_contract_projection`), so the screen draws
-- one shape. A version is listed when it was ever bound to the type.
--
-- **The curator's read.** `curate_global_catalog` with AAL2, like publishing. A type
-- outside the global catalogue is not found. No access record: the catalogue is not
-- anyone's data.

set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function catalog.list_result_contract_versions(
  p_actor_person_id uuid,
  p_actor_session_id uuid,
  p_activity_type_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  perform catalog.require_global_catalog_curator(p_actor_person_id, p_actor_session_id);

  if not exists (
    select 1
    from catalog.activity_types as activity
    where activity.id = p_activity_type_id
      and activity.content_scope = 'global'
  ) then
    raise exception 'activity type not found in the global catalogue' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'activity_type_id', p_activity_type_id,
    'items', coalesce(
      (
        select jsonb_agg(
          catalog.result_contract_projection(contract.id)
          order by contract.published_at desc nulls last, contract.version_number desc,
            contract.id desc
        )
        from catalog.result_contracts as contract
        where contract.status <> 'draft'
          and exists (
            select 1
            from catalog.activity_type_result_contracts as binding
            where binding.result_contract_id = contract.id
              and binding.activity_type_id = p_activity_type_id
          )
      ),
      '[]'::jsonb
    )
  );
end
$function$;

alter function catalog.list_result_contract_versions(uuid, uuid, uuid) owner to allfit_owner;
revoke all on function catalog.list_result_contract_versions(uuid, uuid, uuid) from public;
grant execute on function catalog.list_result_contract_versions(uuid, uuid, uuid) to allfit_api;
