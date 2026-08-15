begin;

create or replace function public.mutate_daily_spot_item(
  p_family_id uuid,
  p_child_id uuid,
  p_session_date date,
  p_action text,
  p_daily_item_id uuid,
  p_expected_version integer,
  p_item_template_id uuid,
  p_name text,
  p_quantity integer,
  p_due_date date
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
  target_session_id uuid;
  target_session_prepared boolean;
  target_item public.daily_items%rowtype;
  target_template public.item_templates%rowtype;
  normalized_name text;
  inserted_item_id uuid;
  changed_value boolean := false;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object('status', 'forbidden', 'changed', false, 'item', null);
  end if;

  if p_family_id is null or p_child_id is null or p_session_date is null
    or p_action not in ('add_template', 'add_temporary', 'delete', 'set_due_date')
  then
    return pg_catalog.jsonb_build_object('status', 'invalid_state', 'changed', false, 'reason', 'invalid_input', 'item', null);
  end if;

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object('status', 'forbidden', 'changed', false, 'item', null);
  end if;

  select family_members.id, family_members.display_name
  into current_member_id, current_member_display_name
  from public.family_members
  where family_members.family_id = p_family_id
    and family_members.user_id = current_user_id;

  if current_member_id is null or not exists (
    select 1 from public.children
    where children.id = p_child_id and children.family_id = p_family_id
  ) then
    return pg_catalog.jsonb_build_object('status', 'forbidden', 'changed', false, 'item', null);
  end if;

  select daily_sessions.id, daily_sessions.is_prepared
  into target_session_id, target_session_prepared
  from public.daily_sessions
  where daily_sessions.family_id = p_family_id
    and daily_sessions.child_id = p_child_id
    and daily_sessions.session_date = p_session_date
  for update;

  if target_session_id is null then
    return pg_catalog.jsonb_build_object('status', 'not_found', 'changed', false, 'item', null);
  end if;

  if target_session_prepared then
    return pg_catalog.jsonb_build_object('status', 'invalid_state', 'changed', false, 'reason', 'session_prepared', 'item', null);
  end if;

  if p_action = 'add_template' then
    if p_item_template_id is null or p_daily_item_id is not null or p_expected_version is not null
      or p_name is not null or p_quantity is not null
    then
      return pg_catalog.jsonb_build_object('status', 'invalid_state', 'changed', false, 'reason', 'invalid_input', 'item', null);
    end if;

    select item_templates.* into target_template
    from public.item_templates
    where item_templates.id = p_item_template_id
      and item_templates.family_id = p_family_id
      and item_templates.child_id = p_child_id
      and item_templates.kind = 'spot'
      and item_templates.is_active = true
    for update;

    if target_template.id is null then
      return pg_catalog.jsonb_build_object('status', 'not_found', 'changed', false, 'item', null);
    end if;

    select daily_items.* into target_item
    from public.daily_items
    where daily_items.daily_session_id = target_session_id
      and daily_items.item_template_id = p_item_template_id
      and daily_items.deleted_at is null
    for update;

    if target_item.id is null then
      insert into public.daily_items (
        family_id, daily_session_id, item_template_id, kind, name, quantity,
        unit, sort_order, is_checked, is_prepared, is_deferred, due_date,
        is_ad_hoc, rough_state, required_quantity, observed_quantity,
        shortage_count, carryover_pending_shortage_count, is_carryover,
        carried_from_daily_item_id, carryover_processed_at,
        carryover_resolved_at, deleted_at, updated_by_member_id,
        updated_by_user_id, updated_by_display_name, version
      ) values (
        p_family_id, target_session_id, target_template.id, 'spot',
        target_template.name, target_template.default_quantity,
        target_template.unit, target_template.sort_order, false, false, false,
        p_due_date, false, null, target_template.default_quantity, null, null,
        null, false, null, null, null, null, current_member_id,
        current_user_id, current_member_display_name, 1
      )
      returning daily_items.id into inserted_item_id;
      changed_value := true;
    else
      inserted_item_id := target_item.id;
    end if;

  elsif p_action = 'add_temporary' then
    normalized_name := pg_catalog.btrim(p_name);
    if p_daily_item_id is null or p_expected_version is not null
      or p_item_template_id is not null or normalized_name is null
      or pg_catalog.char_length(normalized_name) < 1
      or pg_catalog.char_length(normalized_name) > 80
      or p_quantity is null or p_quantity < 0 or p_quantity > 5
    then
      return pg_catalog.jsonb_build_object('status', 'invalid_state', 'changed', false, 'reason', 'invalid_input', 'item', null);
    end if;

    select daily_items.* into target_item
    from public.daily_items
    where daily_items.id = p_daily_item_id
    for update;

    if target_item.id is not null then
      if target_item.family_id <> p_family_id
        or target_item.daily_session_id <> target_session_id
        or target_item.kind <> 'spot' or not target_item.is_ad_hoc
        or target_item.item_template_id is not null
        or target_item.deleted_at is not null
        or target_item.name <> normalized_name
        or target_item.required_quantity <> p_quantity
        or target_item.due_date is distinct from p_due_date
      then
        return pg_catalog.jsonb_build_object('status', 'invalid_state', 'changed', false, 'reason', 'idempotency_mismatch', 'item', null);
      end if;
      inserted_item_id := target_item.id;
    else
      insert into public.daily_items (
        id, family_id, daily_session_id, item_template_id, kind, name,
        quantity, unit, sort_order, is_checked, is_prepared, is_deferred,
        due_date, is_ad_hoc, rough_state, required_quantity,
        observed_quantity, shortage_count, carryover_pending_shortage_count,
        is_carryover, carried_from_daily_item_id, carryover_processed_at,
        carryover_resolved_at, deleted_at, updated_by_member_id,
        updated_by_user_id, updated_by_display_name, version
      ) values (
        p_daily_item_id, p_family_id, target_session_id, null, 'spot',
        normalized_name, p_quantity, '個',
        (select pg_catalog.coalesce(pg_catalog.max(daily_items.sort_order), -1) + 1
         from public.daily_items where daily_items.daily_session_id = target_session_id),
        false, false, false, p_due_date, true, null, p_quantity, null, null,
        null, false, null, null, null, null, current_member_id,
        current_user_id, current_member_display_name, 1
      ) returning daily_items.id into inserted_item_id;
      changed_value := true;
    end if;

  else
    if p_daily_item_id is null or p_expected_version is null or p_expected_version < 1
      or p_item_template_id is not null or p_name is not null or p_quantity is not null
    then
      return pg_catalog.jsonb_build_object('status', 'invalid_state', 'changed', false, 'reason', 'invalid_input', 'item', null);
    end if;

    select daily_items.* into target_item
    from public.daily_items
    where daily_items.id = p_daily_item_id
      and daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and daily_items.kind = 'spot'
      and daily_items.deleted_at is null
    for update;

    if target_item.id is null then
      return pg_catalog.jsonb_build_object('status', 'not_found', 'changed', false, 'item', null);
    end if;
    if target_item.version <> p_expected_version then
      return pg_catalog.jsonb_build_object('status', 'conflict', 'changed', false,
        'item', pg_catalog.jsonb_build_object(
          'daily_item_id', target_item.id,
          'version', target_item.version,
          'deleted_at', target_item.deleted_at,
          'due_date', target_item.due_date,
          'item_template_id', target_item.item_template_id,
          'is_ad_hoc', target_item.is_ad_hoc
        ));
    end if;

    if p_action = 'delete' then
      if p_due_date is not null then
        return pg_catalog.jsonb_build_object('status', 'invalid_state', 'changed', false, 'reason', 'invalid_input', 'item', null);
      end if;
      if target_item.carried_from_daily_item_id is not null or exists (
        select 1 from public.daily_items as referring_items
        where referring_items.carried_from_daily_item_id = target_item.id
      ) then
        return pg_catalog.jsonb_build_object('status', 'invalid_state', 'changed', false, 'reason', 'carryover_linked', 'item', null);
      end if;
      update public.daily_items
      set deleted_at = pg_catalog.clock_timestamp(),
        updated_by_member_id = current_member_id,
        updated_by_user_id = current_user_id,
        updated_by_display_name = current_member_display_name,
        version = daily_items.version + 1
      where daily_items.id = target_item.id and daily_items.version = p_expected_version;
      changed_value := true;
    else
      if target_item.due_date is distinct from p_due_date then
        update public.daily_items
        set due_date = p_due_date,
          updated_by_member_id = current_member_id,
          updated_by_user_id = current_user_id,
          updated_by_display_name = current_member_display_name,
          version = daily_items.version + 1
        where daily_items.id = target_item.id and daily_items.version = p_expected_version;
        changed_value := true;
      end if;
    end if;
    inserted_item_id := target_item.id;
  end if;

  select daily_items.* into target_item from public.daily_items
  where daily_items.id = inserted_item_id;

  return pg_catalog.jsonb_build_object(
    'status', 'success', 'changed', changed_value,
    'item', pg_catalog.jsonb_build_object(
      'daily_item_id', target_item.id,
      'version', target_item.version,
      'deleted_at', target_item.deleted_at,
      'due_date', target_item.due_date,
      'item_template_id', target_item.item_template_id,
      'is_ad_hoc', target_item.is_ad_hoc
    )
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object('status', 'conflict', 'changed', false, 'item', null);
end;
$$;

comment on function public.mutate_daily_spot_item(
  uuid, uuid, date, text, uuid, integer, uuid, text, integer, date
) is 'Adds, soft-deletes, or changes the due date of one active shared daily spot item with session-first locking and optimistic concurrency.';

revoke all on function public.mutate_daily_spot_item(
  uuid, uuid, date, text, uuid, integer, uuid, text, integer, date
) from public;
revoke all on function public.mutate_daily_spot_item(
  uuid, uuid, date, text, uuid, integer, uuid, text, integer, date
) from anon;
revoke all on function public.mutate_daily_spot_item(
  uuid, uuid, date, text, uuid, integer, uuid, text, integer, date
) from authenticated;
grant execute on function public.mutate_daily_spot_item(
  uuid, uuid, date, text, uuid, integer, uuid, text, integer, date
) to authenticated;

commit;
