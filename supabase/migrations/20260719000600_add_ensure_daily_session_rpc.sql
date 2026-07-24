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
    and daily_sessions.session_date = p_session_date;

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

comment on function public.ensure_daily_session(uuid, uuid, date) is
  'Ensures one daily session and missing active template-derived items for a family child on an explicit date without carryover processing.';

revoke all on function public.ensure_daily_session(uuid, uuid, date)
  from public;
revoke all on function public.ensure_daily_session(uuid, uuid, date)
  from anon;
revoke all on function public.ensure_daily_session(uuid, uuid, date)
  from authenticated;

grant execute on function public.ensure_daily_session(uuid, uuid, date)
  to authenticated;
