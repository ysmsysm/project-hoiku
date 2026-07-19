create or replace function public.load_daily_data(
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
  target_child_id uuid;
  target_session_id uuid;
  session_payload jsonb;
  items_payload jsonb;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'session', null,
      'items', pg_catalog.jsonb_build_array()
    );
  end if;

  if p_family_id is null
    or p_child_id is null
    or p_session_date is null
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'session', null,
      'items', pg_catalog.jsonb_build_array()
    );
  end if;

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'session', null,
      'items', pg_catalog.jsonb_build_array()
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
      'items', pg_catalog.jsonb_build_array()
    );
  end if;

  select
    daily_sessions.id,
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
      'thanks_received_by_display_name', daily_sessions.thanks_received_by_display_name,
      'created_at', daily_sessions.created_at,
      'updated_at', daily_sessions.updated_at
    )
  into target_session_id, session_payload
  from public.daily_sessions
  where daily_sessions.family_id = p_family_id
    and daily_sessions.child_id = p_child_id
    and daily_sessions.session_date = p_session_date;

  if target_session_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'session', null,
      'items', pg_catalog.jsonb_build_array()
    );
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', daily_item_rows.id,
        'daily_item_id', daily_item_rows.id,
        'session_id', daily_item_rows.daily_session_id,
        'daily_session_id', daily_item_rows.daily_session_id,
        'family_id', daily_item_rows.family_id,
        'item_template_id', daily_item_rows.item_template_id,
        'kind', daily_item_rows.kind,
        'is_ad_hoc', daily_item_rows.is_ad_hoc,
        'name', daily_item_rows.name,
        'required_quantity', daily_item_rows.required_quantity,
        'observed_quantity', daily_item_rows.observed_quantity,
        'shortage_count', daily_item_rows.shortage_count,
        'quantity', daily_item_rows.quantity,
        'unit', daily_item_rows.unit,
        'rough_state', daily_item_rows.rough_state,
        'is_checked', daily_item_rows.is_checked,
        'is_prepared', daily_item_rows.is_prepared,
        'is_deferred', daily_item_rows.is_deferred,
        'is_carryover', daily_item_rows.is_carryover,
        'carryover_pending_shortage_count',
          daily_item_rows.carryover_pending_shortage_count,
        'carried_from_daily_item_id',
          daily_item_rows.carried_from_daily_item_id,
        'carryover_processed_at',
          daily_item_rows.carryover_processed_at,
        'carryover_resolved_at',
          daily_item_rows.carryover_resolved_at,
        'due_date', daily_item_rows.due_date,
        'sort_order', daily_item_rows.sort_order,
        'version', daily_item_rows.version,
        'updated_by_member_id', daily_item_rows.updated_by_member_id,
        'updated_by_user_id', daily_item_rows.updated_by_user_id,
        'updated_by_display_name', daily_item_rows.updated_by_display_name,
        'created_at', daily_item_rows.created_at,
        'updated_at', daily_item_rows.updated_at
      )
      order by daily_item_rows.sort_order, daily_item_rows.id
    ),
    pg_catalog.jsonb_build_array()
  )
  into items_payload
  from (
    select daily_items.*
    from public.daily_items
    where daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and daily_items.deleted_at is null
    order by daily_items.sort_order, daily_items.id
  ) as daily_item_rows;

  return pg_catalog.jsonb_build_object(
    'status', 'success',
    'session', session_payload,
    'items', items_payload
  );
end;
$$;

comment on function public.load_daily_data(uuid, uuid, date) is
  'Loads one existing daily session and its active items for a family child on an explicit Japan business date without creating rows.';

revoke all on function public.load_daily_data(uuid, uuid, date) from public;
revoke all on function public.load_daily_data(uuid, uuid, date) from anon;
revoke all on function public.load_daily_data(uuid, uuid, date) from authenticated;

grant execute on function public.load_daily_data(uuid, uuid, date)
  to authenticated;
