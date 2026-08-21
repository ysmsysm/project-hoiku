begin;

do $migration$
declare
  function_definition text;
  patched_definition text;
  recheck_anchor text := '  -- Reopen preparation only when the current canonical item state contains a
  -- real preparation target. A check timestamp alone never invalidates it.';
  rough_sync_sql text := $patch$
  -- Local check completion builds preparation from the latest durable rough
  -- states. Refresh the scoped daily snapshot at the same cycle boundary.
  perform item_templates.id
  from public.item_templates
  where item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id
    and item_templates.kind = 'rough'
    and item_templates.is_active = true
    and exists (
      select 1
      from public.daily_items
      where daily_items.family_id = p_family_id
        and daily_items.daily_session_id = target_session_id
        and daily_items.item_template_id = item_templates.id
        and daily_items.deleted_at is null
        and daily_items.kind = 'rough'
    )
  order by item_templates.id
  for update;

  update public.daily_items
  set
    rough_state = item_templates.current_rough_state,
    updated_by_member_id = current_member_id,
    updated_by_user_id = current_user_id,
    updated_by_display_name = current_member_display_name,
    updated_at = pg_catalog.clock_timestamp(),
    version = daily_items.version + 1
  from public.item_templates
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null
    and daily_items.kind = 'rough'
    and daily_items.item_template_id = item_templates.id
    and item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id
    and item_templates.kind = 'rough'
    and item_templates.is_active = true
    and daily_items.rough_state is distinct from
      item_templates.current_rough_state;

$patch$;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.complete_daily_check(uuid,uuid,date,integer)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    recheck_anchor,
    rough_sync_sql || recheck_anchor
  );
  if patched_definition = function_definition
    or pg_catalog.strpos(patched_definition, rough_sync_sql) = 0
  then
    raise exception 'daily_check_rough_sync_contract_not_found';
  end if;
  execute patched_definition;
end;
$migration$;

-- Repair only snapshots whose durable rough state was already established by
-- the latest check. Later edits and completed preparation history are left to
-- their normal next-check transition.
update public.daily_items
set
  rough_state = item_templates.current_rough_state,
  updated_at = pg_catalog.clock_timestamp(),
  version = daily_items.version + 1
from public.daily_sessions, public.item_templates
where daily_sessions.id = daily_items.daily_session_id
  and daily_sessions.family_id = daily_items.family_id
  and daily_sessions.checked_at is not null
  and daily_sessions.prepared_at is null
  and item_templates.id = daily_items.item_template_id
  and item_templates.family_id = daily_items.family_id
  and item_templates.child_id = daily_sessions.child_id
  and item_templates.kind = 'rough'
  and item_templates.is_active = true
  and item_templates.updated_at <= daily_sessions.checked_at
  and daily_items.deleted_at is null
  and daily_items.kind = 'rough'
  and daily_items.rough_state is distinct from item_templates.current_rough_state;

comment on function public.complete_daily_check(uuid, uuid, date, integer) is
  'Completes or refreshes a check, snapshots current rough states, and starts a preparation cycle only for current canonical targets.';

commit;
