-- Close the parent-table paths that could otherwise invalidate carryover
-- references without directly updating daily_items. Keep the lock order used
-- by session mutation RPCs: session rows/table before daily item rows/table.
lock table public.daily_sessions in share row exclusive mode;
lock table public.daily_items in share row exclusive mode;

-- Recheck the global invariant because daily session scope remained mutable
-- between the prior carryover hardening migration and this migration.
do $$
begin
  if exists (
    select 1
    from public.daily_items as destination_items
    left join public.daily_items as source_items
      on source_items.id = destination_items.carried_from_daily_item_id
    left join public.daily_sessions as destination_sessions
      on destination_sessions.id = destination_items.daily_session_id
      and destination_sessions.family_id = destination_items.family_id
    left join public.daily_sessions as source_sessions
      on source_sessions.id = source_items.daily_session_id
      and source_sessions.family_id = source_items.family_id
    where destination_items.carried_from_daily_item_id is not null
      and (
        source_items.id is null
        or destination_items.id = source_items.id
        or destination_items.deleted_at is not null
        or source_items.deleted_at is not null
        or destination_items.family_id is distinct from source_items.family_id
        or destination_sessions.id is null
        or source_sessions.id is null
        or destination_sessions.child_id is distinct from source_sessions.child_id
        or source_sessions.session_date >= destination_sessions.session_date
      )
  ) then
    raise exception 'existing_invalid_daily_carryover_reference'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.enforce_daily_session_scope_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.family_id is distinct from old.family_id
    or new.child_id is distinct from old.child_id
    or new.session_date is distinct from old.session_date
  then
    raise exception 'immutable_daily_session_scope'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_daily_session_scope_immutability() is
  'Rejects changes to the identity and family-child-date scope of an existing daily session.';

revoke all on function public.enforce_daily_session_scope_immutability()
  from public;
revoke all on function public.enforce_daily_session_scope_immutability()
  from anon;
revoke all on function public.enforce_daily_session_scope_immutability()
  from authenticated;

create trigger daily_sessions_enforce_scope_immutability
  before update on public.daily_sessions
  for each row
  execute function public.enforce_daily_session_scope_immutability();

-- Session creation and state mutation remain available to existing
-- security-invoker RPCs. Physical session deletion is not a product workflow;
-- privileged family/child FK cascades remain database-internal operations.
revoke delete on table public.daily_sessions from public;
revoke delete on table public.daily_sessions from anon;
revoke delete on table public.daily_sessions from authenticated;
