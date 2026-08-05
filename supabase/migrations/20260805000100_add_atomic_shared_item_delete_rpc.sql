create or replace function public.delete_family_item_template_for_day(
  p_family_id uuid,
  p_child_id uuid,
  p_session_date date,
  p_item_template_id uuid,
  p_expected_template_updated_at timestamptz,
  p_daily_item_id uuid,
  p_expected_daily_item_version integer
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
  operation_at timestamptz := pg_catalog.now();
  target_child_id uuid;
  target_session_id uuid;
  target_session_prepared_at timestamptz;
  target_template_id uuid;
  target_template_active boolean;
  target_template_updated_at timestamptz;
  active_daily_item_id uuid;
  target_daily_item_id uuid;
  target_daily_item_template_id uuid;
  target_daily_item_version integer;
  target_daily_item_deleted_at timestamptz;
  target_daily_item_is_ad_hoc boolean;
  target_daily_item_is_carryover boolean;
  target_daily_item_is_prepared boolean;
  target_daily_item_is_deferred boolean;
  target_daily_item_carried_from_id uuid;
  target_daily_item_processed_at timestamptz;
  target_daily_item_resolved_at timestamptz;
  target_daily_item_updated_at timestamptz;
  target_daily_item_updated_member_id uuid;
  target_daily_item_updated_user_id uuid;
  target_daily_item_updated_display_name text;
  updated_template_id uuid;
  updated_daily_item_id uuid;
  template_payload jsonb;
  daily_item_payload jsonb;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null,
      'template', null,
      'daily_item', null
    );
  end if;

  if p_family_id is null
    or p_child_id is null
    or p_session_date is null
    or p_item_template_id is null
    or p_expected_template_updated_at is null
    or (p_daily_item_id is null) <> (p_expected_daily_item_version is null)
    or (
      p_expected_daily_item_version is not null
      and p_expected_daily_item_version < 1
    )
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'invalid_input',
      'template', null,
      'daily_item', null
    );
  end if;

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null,
      'template', null,
      'daily_item', null
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
      'reason', null,
      'template', null,
      'daily_item', null
    );
  end if;

  -- The child lock serializes this operation with item-template creation,
  -- sorting, and missing-session materialization. Existing-session
  -- materialization is separately serialized by the ensure function below.
  select children.id
  into target_child_id
  from public.children
  where children.id = p_child_id
    and children.family_id = p_family_id
  for update;

  if target_child_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null,
      'template', null,
      'daily_item', null
    );
  end if;

  -- Daily resources follow the existing session-first lock order. A missing
  -- session is valid for settings deletion and leaves no daily row to clean.
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

  select
    item_templates.id,
    item_templates.is_active,
    item_templates.updated_at
  into
    target_template_id,
    target_template_active,
    target_template_updated_at
  from public.item_templates
  where item_templates.id = p_item_template_id
    and item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id
  for update;

  if target_template_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'changed', false,
      'reason', null,
      'template', null,
      'daily_item', null
    );
  end if;

  template_payload := pg_catalog.jsonb_build_object(
    'id', target_template_id,
    'family_id', p_family_id,
    'child_id', p_child_id,
    'is_active', target_template_active,
    'updated_at', target_template_updated_at
  );

  -- An inactive template is an idempotent retry and is checked before its old
  -- optimistic token. Active templates must still match the loaded timestamp.
  if target_template_active
    and target_template_updated_at is distinct from p_expected_template_updated_at
  then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'changed', false,
      'reason', null,
      'template', template_payload,
      'daily_item', null
    );
  end if;

  if target_session_id is null then
    if p_daily_item_id is not null then
      return pg_catalog.jsonb_build_object(
        'status', 'not_found',
        'changed', false,
        'reason', null,
        'template', template_payload,
        'daily_item', null
      );
    end if;
  else
    -- Lock the caller's row and any active row for this template in UUID order
    -- before resolving either one. The active partial unique index guarantees
    -- that at most one active template-backed row can match.
    perform daily_items.id
    from public.daily_items
    where daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and (
        daily_items.id = p_daily_item_id
        or (
          daily_items.item_template_id = p_item_template_id
          and daily_items.is_ad_hoc = false
          and daily_items.deleted_at is null
        )
      )
    order by daily_items.id
    for update;

    select daily_items.id
    into active_daily_item_id
    from public.daily_items
    where daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and daily_items.item_template_id = p_item_template_id
      and daily_items.is_ad_hoc = false
      and daily_items.deleted_at is null;

    if p_daily_item_id is not null then
      select
        daily_items.id,
        daily_items.item_template_id,
        daily_items.version,
        daily_items.deleted_at,
        daily_items.is_ad_hoc,
        daily_items.is_carryover,
        daily_items.is_prepared,
        daily_items.is_deferred,
        daily_items.carried_from_daily_item_id,
        daily_items.carryover_processed_at,
        daily_items.carryover_resolved_at,
        daily_items.updated_at,
        daily_items.updated_by_member_id,
        daily_items.updated_by_user_id,
        daily_items.updated_by_display_name
      into
        target_daily_item_id,
        target_daily_item_template_id,
        target_daily_item_version,
        target_daily_item_deleted_at,
        target_daily_item_is_ad_hoc,
        target_daily_item_is_carryover,
        target_daily_item_is_prepared,
        target_daily_item_is_deferred,
        target_daily_item_carried_from_id,
        target_daily_item_processed_at,
        target_daily_item_resolved_at,
        target_daily_item_updated_at,
        target_daily_item_updated_member_id,
        target_daily_item_updated_user_id,
        target_daily_item_updated_display_name
      from public.daily_items
      where daily_items.id = p_daily_item_id
        and daily_items.family_id = p_family_id
        and daily_items.daily_session_id = target_session_id;

      if target_daily_item_id is null then
        return pg_catalog.jsonb_build_object(
          'status', 'invalid_state',
          'changed', false,
          'reason', 'daily_item_mismatch',
          'template', template_payload,
          'daily_item', null
        );
      end if;

      daily_item_payload := pg_catalog.jsonb_build_object(
        'id', target_daily_item_id,
        'daily_item_id', target_daily_item_id,
        'daily_session_id', target_session_id,
        'family_id', p_family_id,
        'child_id', p_child_id,
        'session_date', p_session_date,
        'item_template_id', target_daily_item_template_id,
        'version', target_daily_item_version,
        'deleted_at', target_daily_item_deleted_at,
        'updated_at', target_daily_item_updated_at,
        'updated_by_member_id', target_daily_item_updated_member_id,
        'updated_by_user_id', target_daily_item_updated_user_id,
        'updated_by_display_name', target_daily_item_updated_display_name
      );
    end if;

    if active_daily_item_id is not null
      and (
        p_daily_item_id is null
        or active_daily_item_id <> p_daily_item_id
      )
    then
      return pg_catalog.jsonb_build_object(
        'status', 'invalid_state',
        'changed', false,
        'reason', 'daily_item_mismatch',
        'template', template_payload,
        'daily_item', daily_item_payload
      );
    end if;

    if target_daily_item_id is not null
      and (
        target_daily_item_template_id is distinct from p_item_template_id
        or target_daily_item_is_ad_hoc
      )
    then
      return pg_catalog.jsonb_build_object(
        'status', 'invalid_state',
        'changed', false,
        'reason', 'daily_item_mismatch',
        'template', template_payload,
        'daily_item', daily_item_payload
      );
    end if;

    -- A prepared session is immutable unless both sides are already in their
    -- completed deletion state. This prevents template-only partial success
    -- while preserving an idempotent inactive/deleted retry.
    if target_session_prepared_at is not null
      and (
        target_template_active
        or active_daily_item_id is not null
      )
    then
      return pg_catalog.jsonb_build_object(
        'status', 'invalid_state',
        'changed', false,
        'reason', 'session_completed',
        'template', template_payload,
        'daily_item', daily_item_payload
      );
    end if;

    if target_daily_item_id is not null
      and target_daily_item_deleted_at is null
    then
      if target_daily_item_version <> p_expected_daily_item_version then
        return pg_catalog.jsonb_build_object(
          'status', 'conflict',
          'changed', false,
          'reason', null,
          'template', template_payload,
          'daily_item', daily_item_payload
        );
      end if;

      if target_daily_item_version >= 2147483647 then
        return pg_catalog.jsonb_build_object(
          'status', 'invalid_state',
          'changed', false,
          'reason', 'invalid_input',
          'template', template_payload,
          'daily_item', daily_item_payload
        );
      end if;

      if target_daily_item_is_carryover
        or target_daily_item_carried_from_id is not null
        or target_daily_item_processed_at is not null
        or target_daily_item_resolved_at is not null
        or (
          target_daily_item_is_deferred
          and not target_daily_item_is_prepared
        )
        or exists (
          select 1
          from public.daily_items as referring_items
          where referring_items.carried_from_daily_item_id = target_daily_item_id
        )
      then
        return pg_catalog.jsonb_build_object(
          'status', 'invalid_state',
          'changed', false,
          'reason', 'carryover_linked',
          'template', template_payload,
          'daily_item', daily_item_payload
        );
      end if;
    end if;
  end if;

  -- All business, scope, version, completion, and carryover guards are above
  -- both updates. An unexpected exception rolls the complete function call
  -- back because this function intentionally has no exception handler.
  if target_template_active then
    update public.item_templates
    set
      is_active = false,
      updated_at = operation_at
    where item_templates.id = target_template_id
      and item_templates.family_id = p_family_id
      and item_templates.child_id = p_child_id
      and item_templates.is_active = true
      and item_templates.updated_at = p_expected_template_updated_at
    returning item_templates.id into updated_template_id;

    if updated_template_id is null then
      raise exception 'atomic_item_template_delete_failed'
        using errcode = '40001';
    end if;
  end if;

  if target_daily_item_id is not null
    and target_daily_item_deleted_at is null
  then
    update public.daily_items
    set
      deleted_at = operation_at,
      updated_at = operation_at,
      updated_by_member_id = current_member_id,
      updated_by_user_id = current_user_id,
      updated_by_display_name = current_member_display_name,
      version = daily_items.version + 1
    where daily_items.id = target_daily_item_id
      and daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and daily_items.item_template_id = p_item_template_id
      and daily_items.is_ad_hoc = false
      and daily_items.deleted_at is null
      and daily_items.version = p_expected_daily_item_version
      and daily_items.version < 2147483647
    returning daily_items.id into updated_daily_item_id;

    if updated_daily_item_id is null then
      raise exception 'atomic_daily_item_delete_failed'
        using errcode = '40001';
    end if;
  end if;

  select pg_catalog.jsonb_build_object(
    'id', item_templates.id,
    'family_id', item_templates.family_id,
    'child_id', item_templates.child_id,
    'is_active', item_templates.is_active,
    'updated_at', item_templates.updated_at
  )
  into template_payload
  from public.item_templates
  where item_templates.id = target_template_id
    and item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id;

  if target_daily_item_id is not null then
    select pg_catalog.jsonb_build_object(
      'id', daily_items.id,
      'daily_item_id', daily_items.id,
      'daily_session_id', daily_items.daily_session_id,
      'family_id', daily_items.family_id,
      'child_id', p_child_id,
      'session_date', p_session_date,
      'item_template_id', daily_items.item_template_id,
      'version', daily_items.version,
      'deleted_at', daily_items.deleted_at,
      'updated_at', daily_items.updated_at,
      'updated_by_member_id', daily_items.updated_by_member_id,
      'updated_by_user_id', daily_items.updated_by_user_id,
      'updated_by_display_name', daily_items.updated_by_display_name
    )
    into daily_item_payload
    from public.daily_items
    where daily_items.id = target_daily_item_id
      and daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and daily_items.item_template_id = p_item_template_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'success',
    'changed', updated_template_id is not null or updated_daily_item_id is not null,
    'reason', null,
    'template', template_payload,
    'daily_item', daily_item_payload
  );
end;
$$;

comment on function public.delete_family_item_template_for_day(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz,
  uuid,
  integer
) is
  'Atomically deactivates one family item template and soft deletes its non-carryover template-backed daily item for one day with optimistic concurrency protection.';

revoke all on function public.delete_family_item_template_for_day(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz,
  uuid,
  integer
) from public;
revoke all on function public.delete_family_item_template_for_day(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz,
  uuid,
  integer
) from anon;
revoke all on function public.delete_family_item_template_for_day(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz,
  uuid,
  integer
) from authenticated;

grant execute on function public.delete_family_item_template_for_day(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz,
  uuid,
  integer
) to authenticated;

-- Keep daily-session materialization in the same row-lock domain as atomic
-- template deletion. The return contract and item-generation rules are kept
-- identical to the existing function; only the target session is locked before
-- active templates are read and missing daily items are inserted.
create or replace function public.ensure_daily_session(
  p_family_id uuid,
  p_child_id uuid,
  p_session_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_member_id uuid;
  target_child_id uuid;
  inserted_session_id uuid;
  target_session_id uuid;
  created_session boolean := false;
  created_item_count integer := 0;
  session_payload jsonb;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'session', null,
      'created_session', false,
      'created_item_count', 0
    );
  end if;

  if p_family_id is null
    or p_child_id is null
    or p_session_date is null
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'session', null,
      'created_session', false,
      'created_item_count', 0
    );
  end if;

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'session', null,
      'created_session', false,
      'created_item_count', 0
    );
  end if;

  select family_members.id
  into current_member_id
  from public.family_members
  where family_members.family_id = p_family_id
    and family_members.user_id = current_user_id;

  if current_member_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'session', null,
      'created_session', false,
      'created_item_count', 0
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
      'session', null,
      'created_session', false,
      'created_item_count', 0
    );
  end if;

  insert into public.daily_sessions (
    family_id,
    child_id,
    session_date
  )
  values (
    p_family_id,
    p_child_id,
    p_session_date
  )
  on conflict on constraint daily_sessions_one_per_day do nothing
  returning daily_sessions.id into inserted_session_id;

  created_session := inserted_session_id is not null;

  select daily_sessions.id
  into target_session_id
  from public.daily_sessions
  where daily_sessions.family_id = p_family_id
    and daily_sessions.child_id = p_child_id
    and daily_sessions.session_date = p_session_date
  for update;

  with inserted_items as (
    insert into public.daily_items (
      family_id,
      daily_session_id,
      item_template_id,
      kind,
      name,
      quantity,
      unit,
      sort_order,
      is_checked,
      is_prepared,
      is_deferred,
      due_date,
      is_ad_hoc,
      rough_state,
      required_quantity,
      observed_quantity,
      shortage_count,
      carryover_pending_shortage_count,
      is_carryover,
      carried_from_daily_item_id,
      carryover_processed_at,
      carryover_resolved_at,
      deleted_at,
      updated_by_member_id,
      updated_by_user_id,
      updated_by_display_name,
      version
    )
    select
      item_templates.family_id,
      target_session_id,
      item_templates.id,
      item_templates.kind,
      item_templates.name,
      item_templates.default_quantity,
      item_templates.unit,
      item_templates.sort_order,
      false,
      false,
      false,
      null,
      false,
      case
        when item_templates.kind = 'rough' then item_templates.current_rough_state
        else null
      end,
      item_templates.default_quantity,
      null,
      null,
      null,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      1
    from public.item_templates
    where item_templates.family_id = p_family_id
      and item_templates.child_id = p_child_id
      and item_templates.is_active = true
      and (
        item_templates.kind = 'regular'
        or item_templates.kind = 'rough'
        or (
          item_templates.kind = 'spot'
          and exists (
            select 1
            from public.item_template_weekdays
            where item_template_weekdays.item_template_id = item_templates.id
              and item_template_weekdays.family_id = p_family_id
              and item_template_weekdays.weekday =
                extract(dow from p_session_date)::smallint
          )
        )
      )
    on conflict (daily_session_id, item_template_id)
      where item_template_id is not null
        and deleted_at is null
      do nothing
    returning daily_items.id
  )
  select pg_catalog.count(*)::integer
  into created_item_count
  from inserted_items;

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
    'session', session_payload,
    'created_session', created_session,
    'created_item_count', created_item_count
  );
end;
$$;
