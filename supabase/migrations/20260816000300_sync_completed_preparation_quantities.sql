begin;

do $migration$
declare
  complete_definition text;
  update_definition text;
  patched_update_definition text;
  old_guard text := 'if target_session_prepared_at is not null
    and p_action <> ''set_observed_quantity''
  then';
  final_guard text := 'if target_session_prepared_at is not null
    and p_action in (''set_prepared'', ''set_deferred'')
  then';
begin
  complete_definition := pg_catalog.pg_get_functiondef(
    'public.complete_daily_preparation(uuid,uuid,date,integer)'::regprocedure
  );
  if pg_catalog.strpos(
    complete_definition,
    'observed_quantity = daily_items.required_quantity'
  ) = 0
    or pg_catalog.strpos(
      complete_definition,
      'daily_items.is_prepared = true'
    ) = 0
    or pg_catalog.strpos(
      complete_definition,
      'daily_items.is_deferred = false'
    ) = 0
  then
    raise exception 'complete_preparation_quantity_contract_missing';
  end if;

  update_definition := pg_catalog.pg_get_functiondef(
    'public.update_daily_item(uuid,uuid,date,uuid,integer,text,jsonb)'::regprocedure
  );
  if pg_catalog.strpos(update_definition, final_guard) = 0 then
    patched_update_definition := pg_catalog.replace(
      update_definition,
      old_guard,
      final_guard
    );
    if patched_update_definition = update_definition then
      raise exception 'completed_quantity_guard_contract_missing';
    end if;
    execute patched_update_definition;
  end if;
end;
$migration$;

-- The preceding function change only affected completions after it was
-- installed. Reconcile older completed rows only when the item has not been
-- edited after completion, so a later manual correction is never overwritten.
update public.daily_items
set
  observed_quantity = daily_items.required_quantity,
  shortage_count = 0,
  updated_at = daily_sessions.prepared_at,
  version = daily_items.version + 1
from public.daily_sessions
where daily_sessions.id = daily_items.daily_session_id
  and daily_sessions.family_id = daily_items.family_id
  and daily_sessions.prepared_at is not null
  and daily_items.deleted_at is null
  and daily_items.kind = 'regular'
  and daily_items.is_prepared = true
  and daily_items.is_deferred = false
  and daily_items.updated_at <= daily_sessions.prepared_at
  and (
    daily_items.observed_quantity is distinct from daily_items.required_quantity
    or daily_items.shortage_count is distinct from 0
  );

commit;
