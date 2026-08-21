begin;

create table public.daily_thanks_notification_receipts (
  daily_session_id uuid not null,
  family_id uuid not null,
  thanks_sent_at timestamptz not null,
  receiver_member_id uuid not null,
  consumed_at timestamptz not null default pg_catalog.now(),
  primary key (
    daily_session_id,
    thanks_sent_at,
    receiver_member_id
  ),
  constraint daily_thanks_receipts_session_family_fk
    foreign key (daily_session_id, family_id)
    references public.daily_sessions(id, family_id)
    on delete cascade,
  constraint daily_thanks_receipts_receiver_family_fk
    foreign key (receiver_member_id, family_id)
    references public.family_members(id, family_id)
    on delete cascade
);

alter table public.daily_thanks_notification_receipts enable row level security;

revoke all on table public.daily_thanks_notification_receipts from public;
revoke all on table public.daily_thanks_notification_receipts from anon;
revoke all on table public.daily_thanks_notification_receipts from authenticated;

create or replace function public.consume_daily_thanks_notification(
  p_family_id uuid,
  p_child_id uuid,
  p_session_date date,
  p_daily_session_id uuid,
  p_thanks_sent_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_member_id uuid;
  target_child_id uuid;
  target_session_id uuid;
  target_thanks_sent_at timestamptz;
  target_receiver_member_id uuid;
  target_receiver_user_id uuid;
  inserted_receiver_member_id uuid;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'consumed', false,
      'should_display', false,
      'daily_session_id', null,
      'thanks_sent_at', null
    );
  end if;

  if p_family_id is null
    or p_child_id is null
    or p_session_date is null
    or p_daily_session_id is null
    or p_thanks_sent_at is null
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'consumed', false,
      'should_display', false,
      'daily_session_id', null,
      'thanks_sent_at', null
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
      'consumed', false,
      'should_display', false,
      'daily_session_id', null,
      'thanks_sent_at', null
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
      'consumed', false,
      'should_display', false,
      'daily_session_id', null,
      'thanks_sent_at', null
    );
  end if;

  select
    daily_sessions.id,
    daily_sessions.thanks_sent_at,
    daily_sessions.thanks_received_by_member_id,
    daily_sessions.thanks_received_by_user_id
  into
    target_session_id,
    target_thanks_sent_at,
    target_receiver_member_id,
    target_receiver_user_id
  from public.daily_sessions
  where daily_sessions.id = p_daily_session_id
    and daily_sessions.family_id = p_family_id
    and daily_sessions.child_id = p_child_id
    and daily_sessions.session_date = p_session_date
  for update;

  if target_session_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'consumed', false,
      'should_display', false,
      'daily_session_id', null,
      'thanks_sent_at', null
    );
  end if;

  if target_thanks_sent_at is null then
    return pg_catalog.jsonb_build_object(
      'status', 'success',
      'consumed', false,
      'should_display', false,
      'daily_session_id', target_session_id,
      'thanks_sent_at', null
    );
  end if;

  if target_thanks_sent_at <> p_thanks_sent_at then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'consumed', false,
      'should_display', false,
      'daily_session_id', target_session_id,
      'thanks_sent_at', target_thanks_sent_at
    );
  end if;

  if target_receiver_member_id is null
    or target_receiver_user_id is null
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'consumed', false,
      'should_display', false,
      'daily_session_id', target_session_id,
      'thanks_sent_at', target_thanks_sent_at
    );
  end if;

  if target_receiver_member_id <> current_member_id
    or target_receiver_user_id <> current_user_id
  then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'consumed', false,
      'should_display', false,
      'daily_session_id', null,
      'thanks_sent_at', null
    );
  end if;

  insert into public.daily_thanks_notification_receipts (
    daily_session_id,
    family_id,
    thanks_sent_at,
    receiver_member_id,
    consumed_at
  )
  values (
    target_session_id,
    p_family_id,
    target_thanks_sent_at,
    current_member_id,
    pg_catalog.now()
  )
  on conflict (
    daily_session_id,
    thanks_sent_at,
    receiver_member_id
  ) do nothing
  returning receiver_member_id into inserted_receiver_member_id;

  return pg_catalog.jsonb_build_object(
    'status', 'success',
    'consumed', inserted_receiver_member_id is not null,
    'should_display', inserted_receiver_member_id is not null,
    'daily_session_id', target_session_id,
    'thanks_sent_at', target_thanks_sent_at
  );
end;
$$;

comment on function public.consume_daily_thanks_notification(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz
) is
  'Atomically consumes one received daily thanks notification for its authenticated receiver.';

revoke all on function public.consume_daily_thanks_notification(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz
) from public;
revoke all on function public.consume_daily_thanks_notification(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz
) from anon;
revoke all on function public.consume_daily_thanks_notification(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz
) from authenticated;

grant execute on function public.consume_daily_thanks_notification(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz
) to authenticated;

commit;
