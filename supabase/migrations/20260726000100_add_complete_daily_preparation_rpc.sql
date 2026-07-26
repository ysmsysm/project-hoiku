create or replace function public.update_daily_item(
  p_family_id uuid,
  p_child_id uuid,
  p_session_date date,
  p_daily_item_id uuid,
  p_expected_version integer,
  p_action text,
  p_value jsonb
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
  target_item_kind text;
  target_item_required_quantity integer;
  target_item_version integer;
  updated_item_id uuid;
  item_payload jsonb;
  session_payload jsonb;
  observed_quantity_value integer;
  observed_quantity_text text;
  prepared_value boolean;
  deferred_value boolean;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'item', null,
      'session', null
    );
  end if;

  if p_family_id is null
    or p_child_id is null
    or p_session_date is null
    or p_daily_item_id is null
    or p_expected_version is null
    or p_action is null
    or p_value is null
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'item', null,
      'session', null
    );
  end if;

  if p_expected_version < 1 then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'item', null,
      'session', null
    );
  end if;

  if p_action not in (
    'set_observed_quantity',
    'set_prepared',
    'set_deferred'
  ) then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'item', null,
      'session', null
    );
  end if;

  if pg_catalog.jsonb_typeof(p_value) <> 'object' then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'item', null,
      'session', null
    );
  end if;

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'item', null,
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
      'item', null,
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
      'item', null,
      'session', null
    );
  end if;

  -- All daily item mutations lock their session before their item so that
  -- preparation completion cannot race with an item update.
  select
    daily_sessions.id,
    daily_sessions.prepared_at,
    pg_catalog.jsonb_build_object(
      'id', daily_sessions.id,
      'session_id', daily_sessions.id,
      'family_id', daily_sessions.family_id,
      'child_id', daily_sessions.child_id,
      'session_date', daily_sessions.session_date,
      'version', daily_sessions.version,
      'is_checked', daily_sessions.checked_at is not null,
      'checked_by_member_id', daily_sessions.checked_by_member_id,
      'checked_by_user_id', daily_sessions.checked_by_user_id,
      'checked_by_display_name', daily_sessions.checked_by_display_name,
      'checked_at', daily_sessions.checked_at,
      'is_prepared', daily_sessions.prepared_at is not null,
      'prepared_by_member_id', daily_sessions.prepared_by_member_id,
      'prepared_by_user_id', daily_sessions.prepared_by_user_id,
      'prepared_by_display_name', daily_sessions.prepared_by_display_name,
      'prepared_at', daily_sessions.prepared_at,
      'thanks_sent_at', daily_sessions.thanks_sent_at,
      'thanks_sent_by_member_id', daily_sessions.thanks_sent_by_member_id,
      'thanks_sent_by_user_id', daily_sessions.thanks_sent_by_user_id,
      'thanks_sent_by_display_name', daily_sessions.thanks_sent_by_display_name,
      'thanks_received_by_member_id', daily_sessions.thanks_received_by_member_id,
      'thanks_received_by_user_id', daily_sessions.thanks_received_by_user_id,
      'thanks_received_by_display_name',
        daily_sessions.thanks_received_by_display_name,
      'created_at', daily_sessions.created_at,
      'updated_at', daily_sessions.updated_at
    )
  into
    target_session_id,
    target_session_prepared_at,
    session_payload
  from public.daily_sessions
  where daily_sessions.family_id = p_family_id
    and daily_sessions.child_id = p_child_id
    and daily_sessions.session_date = p_session_date
  for update;

  if target_session_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'item', null,
      'session', null
    );
  end if;

  if target_session_prepared_at is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'reason', 'session_prepared',
      'item', null,
      'session', session_payload
    );
  end if;

  select
    daily_items.kind,
    daily_items.required_quantity,
    daily_items.version
  into
    target_item_kind,
    target_item_required_quantity,
    target_item_version
  from public.daily_items
  where daily_items.id = p_daily_item_id
    and daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null
  for update;

  if target_item_kind is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'item', null,
      'session', null
    );
  end if;

  if p_action = 'set_observed_quantity' then
    if target_item_kind <> 'regular'
      or not (p_value ? 'observed_quantity')
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(p_value) as value_keys(key)
        where value_keys.key <> 'observed_quantity'
      )
      or pg_catalog.jsonb_typeof(p_value -> 'observed_quantity') <> 'number'
    then
      return pg_catalog.jsonb_build_object(
        'status', 'invalid_state',
        'item', null,
        'session', null
      );
    end if;

    observed_quantity_text := p_value ->> 'observed_quantity';

    if observed_quantity_text !~ '^[0-9]+$'
      or pg_catalog.char_length(observed_quantity_text) > 10
      or (
        pg_catalog.char_length(observed_quantity_text) = 10
        and observed_quantity_text > '2147483647'
      )
    then
      return pg_catalog.jsonb_build_object(
        'status', 'invalid_state',
        'item', null,
        'session', null
      );
    end if;

    observed_quantity_value := observed_quantity_text::integer;

    if observed_quantity_value < 0
      or observed_quantity_value > target_item_required_quantity
    then
      return pg_catalog.jsonb_build_object(
        'status', 'invalid_state',
        'item', null,
        'session', null
      );
    end if;

    update public.daily_items
    set
      observed_quantity = observed_quantity_value,
      shortage_count = target_item_required_quantity - observed_quantity_value,
      updated_by_member_id = current_member_id,
      updated_by_user_id = current_user_id,
      updated_by_display_name = current_member_display_name,
      version = daily_items.version + 1
    where daily_items.id = p_daily_item_id
      and daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and daily_items.deleted_at is null
      and daily_items.version = p_expected_version
    returning daily_items.id into updated_item_id;
  elsif p_action = 'set_prepared' then
    if not (p_value ? 'is_prepared')
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(p_value) as value_keys(key)
        where value_keys.key <> 'is_prepared'
      )
      or pg_catalog.jsonb_typeof(p_value -> 'is_prepared') <> 'boolean'
    then
      return pg_catalog.jsonb_build_object(
        'status', 'invalid_state',
        'item', null,
        'session', null
      );
    end if;

    prepared_value := (p_value ->> 'is_prepared')::boolean;

    update public.daily_items
    set
      is_prepared = prepared_value,
      is_deferred = case
        when prepared_value then false
        else daily_items.is_deferred
      end,
      updated_by_member_id = current_member_id,
      updated_by_user_id = current_user_id,
      updated_by_display_name = current_member_display_name,
      version = daily_items.version + 1
    where daily_items.id = p_daily_item_id
      and daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and daily_items.deleted_at is null
      and daily_items.version = p_expected_version
    returning daily_items.id into updated_item_id;
  elsif p_action = 'set_deferred' then
    if not (p_value ? 'is_deferred')
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(p_value) as value_keys(key)
        where value_keys.key <> 'is_deferred'
      )
      or pg_catalog.jsonb_typeof(p_value -> 'is_deferred') <> 'boolean'
    then
      return pg_catalog.jsonb_build_object(
        'status', 'invalid_state',
        'item', null,
        'session', null
      );
    end if;

    deferred_value := (p_value ->> 'is_deferred')::boolean;

    update public.daily_items
    set
      is_deferred = deferred_value,
      is_prepared = case
        when deferred_value then false
        else daily_items.is_prepared
      end,
      updated_by_member_id = current_member_id,
      updated_by_user_id = current_user_id,
      updated_by_display_name = current_member_display_name,
      version = daily_items.version + 1
    where daily_items.id = p_daily_item_id
      and daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and daily_items.deleted_at is null
      and daily_items.version = p_expected_version
    returning daily_items.id into updated_item_id;
  end if;

  select pg_catalog.jsonb_build_object(
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
    'updated_at', daily_items.updated_at
  )
  into item_payload
  from public.daily_items
  where daily_items.id = p_daily_item_id
    and daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null;

  if item_payload is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'item', null,
      'session', null
    );
  end if;

  if updated_item_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'item', item_payload,
      'session', null
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'success',
    'item', item_payload,
    'session', null
  );
end;
$$;

comment on function public.update_daily_item(
  uuid,
  uuid,
  date,
  uuid,
  integer,
  text,
  jsonb
) is
  'Updates one existing active daily item before preparation completion with session-first locking and expected-version conflict protection.';

revoke all on function public.update_daily_item(
  uuid,
  uuid,
  date,
  uuid,
  integer,
  text,
  jsonb
) from public;
revoke all on function public.update_daily_item(
  uuid,
  uuid,
  date,
  uuid,
  integer,
  text,
  jsonb
) from anon;
revoke all on function public.update_daily_item(
  uuid,
  uuid,
  date,
  uuid,
  integer,
  text,
  jsonb
) from authenticated;

grant execute on function public.update_daily_item(
  uuid,
  uuid,
  date,
  uuid,
  integer,
  text,
  jsonb
) to authenticated;

create or replace function public.complete_daily_preparation(
  p_family_id uuid,
  p_child_id uuid,
  p_session_date date,
  p_expected_version integer
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
  target_session_checked_at timestamptz;
  target_session_prepared_at timestamptz;
  target_session_version integer;
  updated_session_id uuid;
  incomplete_item_id uuid;
  completed_at timestamptz := pg_catalog.now();
  session_payload jsonb;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'session', null
    );
  end if;

  if p_family_id is null
    or p_child_id is null
    or p_session_date is null
    or p_expected_version is null
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'session', null
    );
  end if;

  if p_expected_version < 1 then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'session', null
    );
  end if;

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
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
      'changed', false,
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
      'changed', false,
      'session', null
    );
  end if;

  select
    daily_sessions.id,
    daily_sessions.checked_at,
    daily_sessions.prepared_at,
    daily_sessions.version,
    pg_catalog.jsonb_build_object(
      'id', daily_sessions.id,
      'session_id', daily_sessions.id,
      'family_id', daily_sessions.family_id,
      'child_id', daily_sessions.child_id,
      'session_date', daily_sessions.session_date,
      'version', daily_sessions.version,
      'is_checked', daily_sessions.checked_at is not null,
      'checked_by_member_id', daily_sessions.checked_by_member_id,
      'checked_by_user_id', daily_sessions.checked_by_user_id,
      'checked_by_display_name', daily_sessions.checked_by_display_name,
      'checked_at', daily_sessions.checked_at,
      'is_prepared', daily_sessions.prepared_at is not null,
      'prepared_by_member_id', daily_sessions.prepared_by_member_id,
      'prepared_by_user_id', daily_sessions.prepared_by_user_id,
      'prepared_by_display_name', daily_sessions.prepared_by_display_name,
      'prepared_at', daily_sessions.prepared_at,
      'thanks_sent_at', daily_sessions.thanks_sent_at,
      'thanks_sent_by_member_id', daily_sessions.thanks_sent_by_member_id,
      'thanks_sent_by_user_id', daily_sessions.thanks_sent_by_user_id,
      'thanks_sent_by_display_name', daily_sessions.thanks_sent_by_display_name,
      'thanks_received_by_member_id', daily_sessions.thanks_received_by_member_id,
      'thanks_received_by_user_id', daily_sessions.thanks_received_by_user_id,
      'thanks_received_by_display_name',
        daily_sessions.thanks_received_by_display_name,
      'created_at', daily_sessions.created_at,
      'updated_at', daily_sessions.updated_at
    )
  into
    target_session_id,
    target_session_checked_at,
    target_session_prepared_at,
    target_session_version,
    session_payload
  from public.daily_sessions
  where daily_sessions.family_id = p_family_id
    and daily_sessions.child_id = p_child_id
    and daily_sessions.session_date = p_session_date
  for update;

  if target_session_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'changed', false,
      'session', null
    );
  end if;

  if target_session_prepared_at is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'success',
      'changed', false,
      'session', session_payload
    );
  end if;

  if target_session_version <> p_expected_version then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'changed', false,
      'session', session_payload
    );
  end if;

  if target_session_checked_at is null then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'reason', 'daily_check_incomplete',
      'changed', false,
      'session', session_payload
    );
  end if;

  -- Lock active items after the session. update_daily_item uses the same order.
  perform daily_items.id
  from public.daily_items
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null
  order by daily_items.id
  for update;

  -- This is the shared preparation-screen predicate:
  -- regular shows a positive current or carried shortage; spot shows a
  -- positive quantity; rough shows a positive refill or carried quantity.
  -- As in buildPreparationItems, every zero-quantity item is excluded.
  select daily_items.id
  into incomplete_item_id
  from public.daily_items
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null
    and daily_items.is_prepared = false
    and daily_items.is_deferred = false
    and (
      (
        daily_items.kind = 'regular'
        and greatest(
          coalesce(
            daily_items.shortage_count,
            daily_items.required_quantity
              - coalesce(daily_items.observed_quantity, 0)
          ),
          coalesce(daily_items.carryover_pending_shortage_count, 0)
        ) > 0
      )
      or (
        daily_items.kind = 'spot'
        and daily_items.required_quantity > 0
      )
      or (
        daily_items.kind = 'rough'
        and daily_items.required_quantity > 0
        and (
          daily_items.rough_state = 'refill'
          or daily_items.is_carryover = true
        )
      )
    )
  order by daily_items.id
  limit 1;

  if incomplete_item_id is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'reason', 'preparation_items_incomplete',
      'changed', false,
      'session', session_payload
    );
  end if;

  update public.daily_sessions
  set
    prepared_at = completed_at,
    prepared_by_member_id = current_member_id,
    prepared_by_user_id = current_user_id,
    prepared_by_display_name = current_member_display_name,
    version = daily_sessions.version + 1
  where daily_sessions.id = target_session_id
    and daily_sessions.family_id = p_family_id
    and daily_sessions.child_id = p_child_id
    and daily_sessions.session_date = p_session_date
    and daily_sessions.prepared_at is null
    and daily_sessions.version = p_expected_version
  returning daily_sessions.id into updated_session_id;

  if updated_session_id is null then
    select pg_catalog.jsonb_build_object(
      'id', daily_sessions.id,
      'session_id', daily_sessions.id,
      'family_id', daily_sessions.family_id,
      'child_id', daily_sessions.child_id,
      'session_date', daily_sessions.session_date,
      'version', daily_sessions.version,
      'is_checked', daily_sessions.checked_at is not null,
      'checked_by_member_id', daily_sessions.checked_by_member_id,
      'checked_by_user_id', daily_sessions.checked_by_user_id,
      'checked_by_display_name', daily_sessions.checked_by_display_name,
      'checked_at', daily_sessions.checked_at,
      'is_prepared', daily_sessions.prepared_at is not null,
      'prepared_by_member_id', daily_sessions.prepared_by_member_id,
      'prepared_by_user_id', daily_sessions.prepared_by_user_id,
      'prepared_by_display_name', daily_sessions.prepared_by_display_name,
      'prepared_at', daily_sessions.prepared_at,
      'thanks_sent_at', daily_sessions.thanks_sent_at,
      'thanks_sent_by_member_id', daily_sessions.thanks_sent_by_member_id,
      'thanks_sent_by_user_id', daily_sessions.thanks_sent_by_user_id,
      'thanks_sent_by_display_name', daily_sessions.thanks_sent_by_display_name,
      'thanks_received_by_member_id', daily_sessions.thanks_received_by_member_id,
      'thanks_received_by_user_id', daily_sessions.thanks_received_by_user_id,
      'thanks_received_by_display_name',
        daily_sessions.thanks_received_by_display_name,
      'created_at', daily_sessions.created_at,
      'updated_at', daily_sessions.updated_at
    )
    into session_payload
    from public.daily_sessions
    where daily_sessions.id = target_session_id
      and daily_sessions.family_id = p_family_id
      and daily_sessions.child_id = p_child_id
      and daily_sessions.session_date = p_session_date;

    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'changed', false,
      'session', session_payload
    );
  end if;

  -- Carryover resolution is derived from successful daily completion.
  -- Preserve the last direct user-operation snapshot while versioning this
  -- row mutation consistently with process_daily_carryovers.
  update public.daily_items
  set
    carryover_resolved_at = completed_at,
    version = daily_items.version + 1
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null
    and daily_items.is_carryover = true
    and daily_items.is_prepared = true
    and daily_items.is_deferred = false
    and daily_items.carryover_resolved_at is null;

  select pg_catalog.jsonb_build_object(
    'id', daily_sessions.id,
    'session_id', daily_sessions.id,
    'family_id', daily_sessions.family_id,
    'child_id', daily_sessions.child_id,
    'session_date', daily_sessions.session_date,
    'version', daily_sessions.version,
    'is_checked', daily_sessions.checked_at is not null,
    'checked_by_member_id', daily_sessions.checked_by_member_id,
    'checked_by_user_id', daily_sessions.checked_by_user_id,
    'checked_by_display_name', daily_sessions.checked_by_display_name,
    'checked_at', daily_sessions.checked_at,
    'is_prepared', daily_sessions.prepared_at is not null,
    'prepared_by_member_id', daily_sessions.prepared_by_member_id,
    'prepared_by_user_id', daily_sessions.prepared_by_user_id,
    'prepared_by_display_name', daily_sessions.prepared_by_display_name,
    'prepared_at', daily_sessions.prepared_at,
    'thanks_sent_at', daily_sessions.thanks_sent_at,
    'thanks_sent_by_member_id', daily_sessions.thanks_sent_by_member_id,
    'thanks_sent_by_user_id', daily_sessions.thanks_sent_by_user_id,
    'thanks_sent_by_display_name', daily_sessions.thanks_sent_by_display_name,
    'thanks_received_by_member_id', daily_sessions.thanks_received_by_member_id,
    'thanks_received_by_user_id', daily_sessions.thanks_received_by_user_id,
    'thanks_received_by_display_name',
      daily_sessions.thanks_received_by_display_name,
    'created_at', daily_sessions.created_at,
    'updated_at', daily_sessions.updated_at
  )
  into session_payload
  from public.daily_sessions
  where daily_sessions.id = target_session_id
    and daily_sessions.family_id = p_family_id
    and daily_sessions.child_id = p_child_id
    and daily_sessions.session_date = p_session_date;

  return pg_catalog.jsonb_build_object(
    'status', 'success',
    'changed', true,
    'session', session_payload
  );
end;
$$;

comment on function public.complete_daily_preparation(
  uuid,
  uuid,
  date,
  integer
) is
  'Completes one checked daily preparation after validating active preparation items, resolves prepared carryovers, and protects the session with expected-version locking.';

revoke all on function public.complete_daily_preparation(
  uuid,
  uuid,
  date,
  integer
) from public;
revoke all on function public.complete_daily_preparation(
  uuid,
  uuid,
  date,
  integer
) from anon;
revoke all on function public.complete_daily_preparation(
  uuid,
  uuid,
  date,
  integer
) from authenticated;

grant execute on function public.complete_daily_preparation(
  uuid,
  uuid,
  date,
  integer
) to authenticated;
