begin;

do $migration$
declare
  function_definition text;
  patched_definition text;
  completion_anchor text := '  -- Carryover resolution is derived from successful daily completion.';
  check_update_sql text := $patch$
  -- Match the local completion contract: a prepared, non-deferred regular
  -- item is now present at its required quantity in the check view.
  update public.daily_items
  set
    observed_quantity = daily_items.required_quantity,
    shortage_count = 0,
    updated_by_member_id = current_member_id,
    updated_by_user_id = current_user_id,
    updated_by_display_name = current_member_display_name,
    version = daily_items.version + 1
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null
    and daily_items.kind = 'regular'
    and daily_items.is_prepared = true
    and daily_items.is_deferred = false
    and (
      daily_items.observed_quantity is distinct from daily_items.required_quantity
      or daily_items.shortage_count is distinct from 0
    );

$patch$;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.complete_daily_preparation(uuid,uuid,date,integer)'::regprocedure
  );

  if pg_catalog.strpos(function_definition, check_update_sql) > 0 then
    raise exception 'completed_preparation_check_update_already_present';
  end if;

  patched_definition := pg_catalog.replace(
    function_definition,
    completion_anchor,
    check_update_sql || completion_anchor
  );
  if patched_definition = function_definition then
    raise exception 'completed_preparation_carryover_anchor_not_found';
  end if;

  execute patched_definition;
end;
$migration$;

comment on function public.complete_daily_preparation(
  uuid,
  uuid,
  date,
  integer
) is
  'Completes one checked daily preparation, reflects prepared regular items in the canonical check state, and resolves prepared carryovers atomically.';

commit;
