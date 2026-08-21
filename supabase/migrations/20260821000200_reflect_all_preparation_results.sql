begin;

do $migration$
declare
  function_definition text;
  patched_definition text;
  item_lock_anchor text := '  -- Lock active items after the session. update_daily_item uses the same order.';
  carryover_anchor text := '  -- Carryover resolution is derived from successful daily completion.';
  rough_template_lock_sql text := $patch$
  -- Match the session -> template -> daily item lock order used by the
  -- atomic template deletion path before changing durable rough state.
  perform item_templates.id
  from public.item_templates
  where item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id
    and item_templates.kind = 'rough'
    and item_templates.id in (
      select daily_items.item_template_id
      from public.daily_items
      where daily_items.family_id = p_family_id
        and daily_items.daily_session_id = target_session_id
        and daily_items.deleted_at is null
        and daily_items.kind = 'rough'
        and daily_items.item_template_id is not null
    )
  order by item_templates.id
  for update;

$patch$;
  rough_completion_sql text := $patch$
  -- Match the local completion contract: prepared, non-deferred rough items
  -- return their durable and daily canonical state to enough.
  update public.item_templates
  set current_rough_state = 'enough'
  where item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id
    and item_templates.kind = 'rough'
    and item_templates.current_rough_state is distinct from 'enough'
    and exists (
      select 1
      from public.daily_items
      where daily_items.family_id = p_family_id
        and daily_items.daily_session_id = target_session_id
        and daily_items.deleted_at is null
        and daily_items.kind = 'rough'
        and daily_items.item_template_id = item_templates.id
        and daily_items.is_prepared = true
        and daily_items.is_deferred = false
    );

  update public.daily_items
  set
    rough_state = 'enough',
    updated_by_member_id = current_member_id,
    updated_by_user_id = current_user_id,
    updated_by_display_name = current_member_display_name,
    version = daily_items.version + 1
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null
    and daily_items.kind = 'rough'
    and daily_items.is_prepared = true
    and daily_items.is_deferred = false
    and daily_items.rough_state is distinct from 'enough';

$patch$;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.complete_daily_preparation(uuid,uuid,date,integer)'::regprocedure
  );
  if pg_catalog.strpos(
    function_definition,
    'observed_quantity = daily_items.required_quantity'
  ) = 0
    or pg_catalog.strpos(function_definition, 'daily_items.kind = ''regular''') = 0
  then
    raise exception 'complete_preparation_regular_contract_missing';
  end if;
  patched_definition := pg_catalog.replace(
    function_definition,
    item_lock_anchor,
    rough_template_lock_sql || item_lock_anchor
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    carryover_anchor,
    rough_completion_sql || carryover_anchor
  );
  if patched_definition = function_definition
    or pg_catalog.strpos(patched_definition, rough_template_lock_sql) = 0
    or pg_catalog.strpos(patched_definition, rough_completion_sql) = 0
  then
    raise exception 'complete_preparation_all_kinds_contract_not_found';
  end if;
  execute patched_definition;
end;
$migration$;

do $spot_migration$
declare
  function_definition text;
  patched_definition text;
  existing_template_noop text := '    else
      inserted_item_id := target_item.id;
    end if;

  elsif p_action = ''add_temporary'' then';
  completed_template_reopen text := $patch$
    else
      -- A prepared template-backed spot is absent from the local check state.
      -- Adding it again after completion reopens that same canonical daily row.
      if target_session_prepared
        and target_item.is_prepared = true
        and target_item.is_deferred = false
      then
        update public.daily_items
        set
          is_prepared = false,
          due_date = p_due_date,
          updated_by_member_id = current_member_id,
          updated_by_user_id = current_user_id,
          updated_by_display_name = current_member_display_name,
          version = daily_items.version + 1
        where daily_items.id = target_item.id
          and daily_items.is_prepared = true
          and daily_items.is_deferred = false;
        changed_value := true;
      end if;
      inserted_item_id := target_item.id;
    end if;

  elsif p_action = 'add_temporary' then$patch$;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.mutate_daily_spot_item(uuid,uuid,date,text,uuid,integer,uuid,text,integer,date)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    existing_template_noop,
    completed_template_reopen
  );
  if patched_definition = function_definition
    or pg_catalog.strpos(patched_definition, completed_template_reopen) = 0
  then
    raise exception 'completed_template_spot_reopen_contract_not_found';
  end if;
  execute patched_definition;
end;
$spot_migration$;

-- Durable template writes are RPC-only. Keep the existing explicit auth,
-- membership, child, date, and session checks while allowing this RPC to
-- perform the atomic rough-template update.
alter function public.complete_daily_preparation(uuid, uuid, date, integer)
  owner to postgres;
alter function public.complete_daily_preparation(uuid, uuid, date, integer)
  security definer;
alter function public.complete_daily_preparation(uuid, uuid, date, integer)
  set search_path = '';

-- Repair only old completion snapshots that have not been edited after their
-- completion. A later explicit rough-state change always wins.
update public.item_templates
set current_rough_state = 'enough'
where item_templates.kind = 'rough'
  and item_templates.current_rough_state is distinct from 'enough'
  and exists (
    select 1
    from public.daily_items
    join public.daily_sessions
      on daily_sessions.id = daily_items.daily_session_id
      and daily_sessions.family_id = daily_items.family_id
    where daily_items.family_id = item_templates.family_id
      and daily_sessions.child_id = item_templates.child_id
      and daily_items.item_template_id = item_templates.id
      and daily_sessions.prepared_at is not null
      and daily_items.deleted_at is null
      and daily_items.kind = 'rough'
      and daily_items.is_prepared = true
      and daily_items.is_deferred = false
      and item_templates.updated_at <= daily_sessions.prepared_at
      and (
        daily_items.updated_at <= daily_sessions.prepared_at
        or daily_items.carryover_resolved_at = daily_sessions.prepared_at
      )
  );

update public.daily_items
set
  rough_state = 'enough',
  updated_at = daily_sessions.prepared_at,
  version = daily_items.version + 1
from public.daily_sessions
where daily_sessions.id = daily_items.daily_session_id
  and daily_sessions.family_id = daily_items.family_id
  and daily_sessions.prepared_at is not null
  and daily_items.deleted_at is null
  and daily_items.kind = 'rough'
  and daily_items.is_prepared = true
  and daily_items.is_deferred = false
  and daily_items.rough_state is distinct from 'enough'
  and (
    daily_items.updated_at <= daily_sessions.prepared_at
    or daily_items.carryover_resolved_at = daily_sessions.prepared_at
  );

comment on function public.complete_daily_preparation(uuid, uuid, date, integer) is
  'Completes checked preparation, reflects prepared regular, spot, and rough results in canonical check state, and resolves prepared carryovers atomically.';

commit;
