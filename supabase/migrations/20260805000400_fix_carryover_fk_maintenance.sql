-- Replace the carryover validator without a race window. Session-first order
-- matches the parent-scope hardening migration and existing session RPCs.
lock table public.daily_sessions in share row exclusive mode;
lock table public.daily_items in share row exclusive mode;

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

create or replace function public.validate_daily_carryover_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform source_items.id
    from public.daily_items as source_items
    where source_items.id in (
      select inserted_rows.carried_from_daily_item_id
      from inserted_rows
      where inserted_rows.carried_from_daily_item_id is not null
    )
    order by source_items.id
    for update;

    if exists (
      select 1
      from inserted_rows as destination_items
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
      raise exception 'invalid_daily_carryover_reference'
        using errcode = '23514';
    end if;

    return null;
  end if;

  if tg_op = 'UPDATE' then
    -- An UPDATE must preserve row identity. This makes physical source absence
    -- a reliable FK-maintenance signal rather than something a client can
    -- manufacture by changing the source UUID in the same statement.
    if exists (
      select 1
      from previous_rows
      left join updated_rows
        on updated_rows.id = previous_rows.id
      where updated_rows.id is null
    )
      or exists (
        select 1
        from updated_rows
        left join previous_rows
          on previous_rows.id = updated_rows.id
        where previous_rows.id is null
      )
    then
      raise exception 'invalid_daily_carryover_reference'
        using errcode = '23514';
    end if;

    -- A direct UUID-to-null update still sees its physical source and is
    -- rejected. During the self-FK's ON DELETE SET NULL action, the deleted
    -- source is no longer visible to this transaction, so maintenance passes.
    if exists (
      select 1
      from previous_rows
      join updated_rows
        on updated_rows.id = previous_rows.id
      where previous_rows.carried_from_daily_item_id is not null
        and updated_rows.carried_from_daily_item_id is null
        and exists (
          select 1
          from public.daily_items as unlink_sources
          where unlink_sources.id =
            previous_rows.carried_from_daily_item_id
        )
    ) then
      raise exception 'invalid_daily_carryover_reference'
        using errcode = '23514';
    end if;

    begin
      perform source_items.id
      from public.daily_items as source_items
      where source_items.id in (
        select updated_rows.carried_from_daily_item_id
        from updated_rows
        where updated_rows.carried_from_daily_item_id is not null
      )
      order by source_items.id
      for update nowait;
    exception
      when lock_not_available then
        raise exception 'invalid_daily_carryover_reference'
          using errcode = '23514';
    end;

    if exists (
      select 1
      from updated_rows as destination_items
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
      raise exception 'invalid_daily_carryover_reference'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from updated_rows as source_items
      join public.daily_items as destination_items
        on destination_items.carried_from_daily_item_id = source_items.id
      left join public.daily_sessions as destination_sessions
        on destination_sessions.id = destination_items.daily_session_id
        and destination_sessions.family_id = destination_items.family_id
      left join public.daily_sessions as source_sessions
        on source_sessions.id = source_items.daily_session_id
        and source_sessions.family_id = source_items.family_id
      where source_items.deleted_at is not null
        or destination_items.deleted_at is not null
        or destination_items.id = source_items.id
        or destination_items.family_id is distinct from source_items.family_id
        or destination_sessions.id is null
        or source_sessions.id is null
        or destination_sessions.child_id is distinct from source_sessions.child_id
        or source_sessions.session_date >= destination_sessions.session_date
    ) then
      raise exception 'invalid_daily_carryover_reference'
        using errcode = '23514';
    end if;

    return null;
  end if;

  raise exception 'invalid_daily_carryover_reference'
    using errcode = '23514';
end;
$$;

alter function public.validate_daily_carryover_references()
  owner to postgres;

comment on function public.validate_daily_carryover_references() is
  'Validates carryover references globally and permits UUID-to-null only after physical source deletion by FK maintenance.';

revoke all on function public.validate_daily_carryover_references()
  from public;
revoke all on function public.validate_daily_carryover_references()
  from anon;
revoke all on function public.validate_daily_carryover_references()
  from authenticated;
