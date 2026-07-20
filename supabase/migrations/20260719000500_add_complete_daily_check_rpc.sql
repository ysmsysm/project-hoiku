create or replace function public.complete_daily_check(
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
  target_session_version integer;
  updated_session_id uuid;
  session_payload jsonb;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
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
      'session', null
    );
  end if;

  if p_expected_version < 1 then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'session', null
    );
  end if;

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
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
      'session', null
    );
  end if;

  select
    daily_sessions.id,
    daily_sessions.checked_at,
    daily_sessions.version
  into
    target_session_id,
    target_session_checked_at,
    target_session_version
  from public.daily_sessions
  where daily_sessions.family_id = p_family_id
    and daily_sessions.child_id = p_child_id
    and daily_sessions.session_date = p_session_date;

  if target_session_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'session', null
    );
  end if;

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

  if target_session_version <> p_expected_version then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'session', session_payload
    );
  end if;

  if target_session_checked_at is null then
    update public.daily_sessions
    set
      checked_at = now(),
      checked_by_member_id = current_member_id,
      checked_by_user_id = current_user_id,
      checked_by_display_name = current_member_display_name,
      version = daily_sessions.version + 1
    where daily_sessions.id = target_session_id
      and daily_sessions.family_id = p_family_id
      and daily_sessions.child_id = p_child_id
      and daily_sessions.session_date = p_session_date
      and daily_sessions.checked_at is null
      and daily_sessions.version = p_expected_version
    returning daily_sessions.id into updated_session_id;

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

    if updated_session_id is null then
      return pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'session', session_payload
      );
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'success',
    'session', session_payload
  );
end;
$$;

comment on function public.complete_daily_check(uuid, uuid, date, integer) is
  'Completes one existing daily session check with expected-version conflict protection.';

revoke all on function public.complete_daily_check(uuid, uuid, date, integer)
  from public;
revoke all on function public.complete_daily_check(uuid, uuid, date, integer)
  from anon;
revoke all on function public.complete_daily_check(uuid, uuid, date, integer)
  from authenticated;

grant execute on function public.complete_daily_check(uuid, uuid, date, integer)
  to authenticated;
