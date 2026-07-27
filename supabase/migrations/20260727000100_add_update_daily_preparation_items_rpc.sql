create or replace function public.update_daily_preparation_items(
  p_family_id uuid,
  p_child_id uuid,
  p_session_date date,
  p_updates jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_member_id uuid;
  current_member_display_name text;
  target_child_id uuid;
  target_session_id uuid;
  target_session_prepared_at timestamptz;
  requested_count integer;
  locked_count integer;
  conflict_count integer;
  changed_count integer := 0;
  changed_item_ids uuid[] := array[]::uuid[];
  mutation_at timestamptz := pg_catalog.now();
  item_payloads jsonb := '[]'::jsonb;
  conflict_payloads jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'requested_count', 0,
      'changed_count', 0,
      'unchanged_count', 0,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  if p_family_id is null
    or p_child_id is null
    or p_session_date is null
    or p_updates is null
    or pg_catalog.jsonb_typeof(p_updates) <> 'array'
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'reason', 'invalid_updates',
      'requested_count', 0,
      'changed_count', 0,
      'unchanged_count', 0,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  requested_count := pg_catalog.jsonb_array_length(p_updates);

  if requested_count > 100 then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'reason', 'too_many_updates',
      'requested_count', requested_count,
      'changed_count', 0,
      'unchanged_count', requested_count,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_updates) as update_elements(value)
    where pg_catalog.jsonb_typeof(update_elements.value) <> 'object'
  ) then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'reason', 'invalid_update',
      'requested_count', requested_count,
      'changed_count', 0,
      'unchanged_count', requested_count,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_updates) as update_elements(value)
    where not (update_elements.value ? 'daily_item_id')
      or not (update_elements.value ? 'expected_version')
      or not (update_elements.value ? 'is_prepared')
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(update_elements.value)
          as update_keys(key)
        where update_keys.key not in (
          'daily_item_id',
          'expected_version',
          'is_prepared'
        )
      )
      or pg_catalog.jsonb_typeof(
        update_elements.value -> 'daily_item_id'
      ) <> 'string'
      or pg_catalog.jsonb_typeof(
        update_elements.value -> 'expected_version'
      ) <> 'number'
      or pg_catalog.jsonb_typeof(
        update_elements.value -> 'is_prepared'
      ) <> 'boolean'
      or (update_elements.value ->> 'daily_item_id') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or (update_elements.value ->> 'expected_version') !~ '^[1-9][0-9]*$'
      or pg_catalog.char_length(
        update_elements.value ->> 'expected_version'
      ) > 10
      or (
        pg_catalog.char_length(
          update_elements.value ->> 'expected_version'
        ) = 10
        and (update_elements.value ->> 'expected_version') > '2147483647'
      )
  ) then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'reason', 'invalid_update',
      'requested_count', requested_count,
      'changed_count', 0,
      'unchanged_count', requested_count,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  if (
    select pg_catalog.count(*)
    from (
      select update_elements.value ->> 'daily_item_id'
      from pg_catalog.jsonb_array_elements(p_updates)
        as update_elements(value)
      group by update_elements.value ->> 'daily_item_id'
      having pg_catalog.count(*) > 1
    ) as duplicate_updates
  ) > 0 then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'reason', 'duplicate_daily_item_id',
      'requested_count', requested_count,
      'changed_count', 0,
      'unchanged_count', requested_count,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'requested_count', requested_count,
      'changed_count', 0,
      'unchanged_count', requested_count,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  select
    family_members.id,
    family_members.display_name
  into
    current_member_id,
    current_member_display_name
  from public.family_members
  where family_members.family_id = p_family_id
    and family_members.user_id = current_user_id;

  if current_member_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'requested_count', requested_count,
      'changed_count', 0,
      'unchanged_count', requested_count,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  select children.id
  into target_child_id
  from public.children
  where children.id = p_child_id
    and children.family_id = p_family_id;

  if target_child_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'requested_count', requested_count,
      'changed_count', 0,
      'unchanged_count', requested_count,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  -- Every daily item mutation locks its destination session first.
  select
    daily_sessions.id,
    daily_sessions.prepared_at
  into
    target_session_id,
    target_session_prepared_at
  from public.daily_sessions
  where daily_sessions.family_id = p_family_id
    and daily_sessions.child_id = p_child_id
    and daily_sessions.session_date = p_session_date
  for update;

  if target_session_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'reason', 'session_not_found',
      'requested_count', requested_count,
      'changed_count', 0,
      'unchanged_count', requested_count,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  if target_session_prepared_at is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'reason', 'session_prepared',
      'requested_count', requested_count,
      'changed_count', 0,
      'unchanged_count', requested_count,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  -- Lock only explicitly requested active items, in UUID order, after the
  -- session lock. Missing, deleted, or out-of-scope rows remain unmatched.
  perform daily_items.id
  from public.daily_items
  join (
    select (update_elements.value ->> 'daily_item_id')::uuid as daily_item_id
    from pg_catalog.jsonb_array_elements(p_updates)
      as update_elements(value)
  ) as requested_updates
    on requested_updates.daily_item_id = daily_items.id
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null
  order by daily_items.id
  for update of daily_items;

  select pg_catalog.count(*)
  into locked_count
  from public.daily_items
  join (
    select (update_elements.value ->> 'daily_item_id')::uuid as daily_item_id
    from pg_catalog.jsonb_array_elements(p_updates)
      as update_elements(value)
  ) as requested_updates
    on requested_updates.daily_item_id = daily_items.id
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null;

  if locked_count <> requested_count then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'reason', 'daily_item_not_found',
      'requested_count', requested_count,
      'changed_count', 0,
      'unchanged_count', requested_count,
      'items', '[]'::jsonb,
      'conflicts', '[]'::jsonb,
      'session', null
    );
  end if;

  -- Validate every expected version after every target row is locked and
  -- before any update runs. A conflict therefore produces zero mutations.
  select
    pg_catalog.count(*),
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'daily_item_id', daily_items.id,
          'expected_version', requested_updates.expected_version,
          'current_version', daily_items.version,
          'is_prepared', daily_items.is_prepared,
          'is_deferred', daily_items.is_deferred,
          'updated_by_member_id', daily_items.updated_by_member_id,
          'updated_by_user_id', daily_items.updated_by_user_id,
          'updated_by_display_name', daily_items.updated_by_display_name,
          'updated_at', daily_items.updated_at
        )
        order by daily_items.id
      ),
      '[]'::jsonb
    )
  into
    conflict_count,
    conflict_payloads
  from public.daily_items
  join (
    select
      (update_elements.value ->> 'daily_item_id')::uuid as daily_item_id,
      (update_elements.value ->> 'expected_version')::integer
        as expected_version
    from pg_catalog.jsonb_array_elements(p_updates)
      as update_elements(value)
  ) as requested_updates
    on requested_updates.daily_item_id = daily_items.id
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null
    and daily_items.version <> requested_updates.expected_version;

  if conflict_count > 0 then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'requested_count', requested_count,
      'changed_count', 0,
      'unchanged_count', requested_count,
      'items', '[]'::jsonb,
      'conflicts', conflict_payloads,
      'session', null
    );
  end if;

  -- Only real state changes are updated. Setting prepared=true also clears a
  -- deferred state; setting prepared=false preserves the deferred state.
  with requested_updates as (
    select
      (update_elements.value ->> 'daily_item_id')::uuid as daily_item_id,
      (update_elements.value ->> 'expected_version')::integer
        as expected_version,
      (update_elements.value ->> 'is_prepared')::boolean as is_prepared
    from pg_catalog.jsonb_array_elements(p_updates)
      as update_elements(value)
  ),
  updated_items as (
    update public.daily_items
    set
      is_prepared = requested_updates.is_prepared,
      is_deferred = case
        when requested_updates.is_prepared then false
        else daily_items.is_deferred
      end,
      updated_by_member_id = current_member_id,
      updated_by_user_id = current_user_id,
      updated_by_display_name = current_member_display_name,
      updated_at = mutation_at,
      version = daily_items.version + 1
    from requested_updates
    where daily_items.id = requested_updates.daily_item_id
      and daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and daily_items.deleted_at is null
      and daily_items.version = requested_updates.expected_version
      and (
        daily_items.is_prepared is distinct from requested_updates.is_prepared
        or (
          requested_updates.is_prepared
          and daily_items.is_deferred
        )
      )
    returning daily_items.id
  )
  select
    pg_catalog.count(*),
    coalesce(
      pg_catalog.array_agg(updated_items.id order by updated_items.id),
      array[]::uuid[]
    )
  into
    changed_count,
    changed_item_ids
  from updated_items;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', daily_items.id,
        'daily_item_id', daily_items.id,
        'session_id', daily_items.daily_session_id,
        'daily_session_id', daily_items.daily_session_id,
        'family_id', daily_items.family_id,
        'item_template_id', daily_items.item_template_id,
        'kind', daily_items.kind,
        'is_ad_hoc', daily_items.is_ad_hoc,
        'name', daily_items.name,
        'required_quantity', daily_items.required_quantity,
        'observed_quantity', daily_items.observed_quantity,
        'shortage_count', daily_items.shortage_count,
        'quantity', daily_items.quantity,
        'unit', daily_items.unit,
        'rough_state', daily_items.rough_state,
        'is_checked', daily_items.is_checked,
        'is_prepared', daily_items.is_prepared,
        'is_deferred', daily_items.is_deferred,
        'is_carryover', daily_items.is_carryover,
        'carryover_pending_shortage_count',
          daily_items.carryover_pending_shortage_count,
        'carried_from_daily_item_id', daily_items.carried_from_daily_item_id,
        'carryover_processed_at', daily_items.carryover_processed_at,
        'carryover_resolved_at', daily_items.carryover_resolved_at,
        'due_date', daily_items.due_date,
        'sort_order', daily_items.sort_order,
        'version', daily_items.version,
        'updated_by_member_id', daily_items.updated_by_member_id,
        'updated_by_user_id', daily_items.updated_by_user_id,
        'updated_by_display_name', daily_items.updated_by_display_name,
        'created_at', daily_items.created_at,
        'updated_at', daily_items.updated_at,
        'changed', daily_items.id = any(changed_item_ids)
      )
      order by daily_items.id
    ),
    '[]'::jsonb
  )
  into item_payloads
  from public.daily_items
  join (
    select (update_elements.value ->> 'daily_item_id')::uuid as daily_item_id
    from pg_catalog.jsonb_array_elements(p_updates)
      as update_elements(value)
  ) as requested_updates
    on requested_updates.daily_item_id = daily_items.id
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null;

  return pg_catalog.jsonb_build_object(
    'status', 'success',
    'requested_count', requested_count,
    'changed_count', changed_count,
    'unchanged_count', requested_count - changed_count,
    'items', item_payloads,
    'conflicts', '[]'::jsonb,
    'session', null
  );
end;
$$;

comment on function public.update_daily_preparation_items(
  uuid,
  uuid,
  date,
  jsonb
) is
  'Atomically updates explicitly requested preparation states with session-first locking, stable item locking, and per-item expected-version protection.';

revoke all on function public.update_daily_preparation_items(
  uuid,
  uuid,
  date,
  jsonb
) from public;
revoke all on function public.update_daily_preparation_items(
  uuid,
  uuid,
  date,
  jsonb
) from anon;
revoke all on function public.update_daily_preparation_items(
  uuid,
  uuid,
  date,
  jsonb
) from authenticated;

grant execute on function public.update_daily_preparation_items(
  uuid,
  uuid,
  date,
  jsonb
) to authenticated;
