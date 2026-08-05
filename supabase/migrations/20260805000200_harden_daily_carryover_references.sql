-- Block concurrent writes while existing references are checked and the
-- validation triggers become active. Supabase migrations run transactionally.
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
    -- Lock all referenced sources in one stable order. The lock serializes
    -- direct INSERTs and process_daily_carryovers with source soft deletion.
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
    -- Top-level clients and security-invoker RPCs have no supported unlink
    -- operation. Preserve ON DELETE SET NULL for nested FK cascade maintenance,
    -- but reject a direct UUID-to-null update that could erase lineage before
    -- the source is soft deleted.
    if pg_catalog.pg_trigger_depth() = 1
      and exists (
        select 1
        from previous_rows
        join updated_rows
          on updated_rows.id = previous_rows.id
        where previous_rows.carried_from_daily_item_id is not null
          and updated_rows.carried_from_daily_item_id is null
      )
    then
      raise exception 'invalid_daily_carryover_reference'
        using errcode = '23514';
    end if;

    -- UPDATE transition tables contain the final statement state. Validate all
    -- non-null links, including unchanged links on a row whose scope or
    -- deleted_at may have changed, and lock distinct sources by UUID.
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
        -- UPDATE has already locked its destination rows. Refuse a competing
        -- source-first operation instead of waiting in the opposite order and
        -- creating a destination/source deadlock cycle.
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

    -- A source row can be updated without changing any destination link. Check
    -- every inbound reference globally so direct source soft deletion, scope
    -- moves, and concurrent cross-scope changes cannot bypass the invariant.
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
  'Validates and locks daily carryover references globally through statement transition tables; callable only as a trigger.';

revoke all on function public.validate_daily_carryover_references()
  from public;
revoke all on function public.validate_daily_carryover_references()
  from anon;
revoke all on function public.validate_daily_carryover_references()
  from authenticated;

create trigger daily_items_validate_carryover_references_insert
  after insert on public.daily_items
  referencing new table as inserted_rows
  for each statement
  execute function public.validate_daily_carryover_references();

create trigger daily_items_validate_carryover_references_update
  after update on public.daily_items
  referencing old table as previous_rows new table as updated_rows
  for each statement
  execute function public.validate_daily_carryover_references();

-- No repository production path physically deletes daily items. Keep INSERT
-- and UPDATE for existing security-invoker RPCs, but remove the direct DELETE
-- capability that could invoke the self-FK's ON DELETE SET NULL behavior.
revoke delete on table public.daily_items from public;
revoke delete on table public.daily_items from anon;
revoke delete on table public.daily_items from authenticated;
