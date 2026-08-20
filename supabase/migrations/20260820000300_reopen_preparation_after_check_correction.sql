begin;

do $migration$
declare
  function_definition text;
  patched_definition text;
  recheck_anchor text := '  if target_session_checked_at is null
    or target_session_prepared_at > target_session_checked_at
  then';
  recheck_detection text := $patch$
  -- Reopen preparation only when the current canonical item state contains a
  -- real preparation target. A check timestamp alone never invalidates it.
  perform daily_items.id
  from public.daily_items
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null
  order by daily_items.id
  for update;

  select exists (
    select 1
    from public.daily_items
    where daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and daily_items.deleted_at is null
      and target_session_prepared_at is not null
      and (
        (
          daily_items.is_prepared = false
          and daily_items.is_deferred = false
        )
        or (
          daily_items.kind = 'regular'
          and coalesce(
            daily_items.shortage_count,
            daily_items.required_quantity
              - coalesce(daily_items.observed_quantity, 0)
          ) > 0
          and daily_items.updated_at > target_session_prepared_at
        )
      )
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
  ) into repreparation_required;

$patch$;
  item_reset_anchor text := '    returning daily_sessions.id into updated_session_id;

    select pg_catalog.jsonb_build_object(';
  item_reset_sql text := $patch$
    returning daily_sessions.id into updated_session_id;

    if updated_session_id is not null and repreparation_required then
      update public.daily_items
      set
        is_prepared = false,
        is_deferred = false,
        updated_by_member_id = current_member_id,
        updated_by_user_id = current_user_id,
        updated_by_display_name = current_member_display_name,
        updated_at = pg_catalog.clock_timestamp(),
        version = daily_items.version + 1
      where daily_items.family_id = p_family_id
        and daily_items.daily_session_id = target_session_id
        and daily_items.deleted_at is null
        and daily_items.kind = 'regular'
        and coalesce(
          daily_items.shortage_count,
          daily_items.required_quantity
            - coalesce(daily_items.observed_quantity, 0)
        ) > 0
        and daily_items.updated_at > target_session_prepared_at
        and (
          daily_items.is_prepared = true
          or daily_items.is_deferred = true
        );
    end if;

    select pg_catalog.jsonb_build_object($patch$;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.complete_daily_check(uuid,uuid,date,integer)'::regprocedure
  );
  patched_definition := function_definition;

  patched_definition := pg_catalog.replace(
    patched_definition,
    '  target_session_version integer;',
    '  target_session_version integer;
  repreparation_required boolean := false;'
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    recheck_anchor,
    recheck_detection || '  if target_session_checked_at is null
    or target_session_prepared_at > target_session_checked_at
    or repreparation_required
  then'
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    '      checked_by_display_name = current_member_display_name,
      version = daily_sessions.version + 1',
    '      checked_by_display_name = current_member_display_name,
      prepared_at = case
        when repreparation_required then null
        else daily_sessions.prepared_at
      end,
      prepared_by_member_id = case
        when repreparation_required then null
        else daily_sessions.prepared_by_member_id
      end,
      prepared_by_user_id = case
        when repreparation_required then null
        else daily_sessions.prepared_by_user_id
      end,
      prepared_by_display_name = case
        when repreparation_required then null
        else daily_sessions.prepared_by_display_name
      end,
      thanks_sent_at = case
        when repreparation_required then null
        else daily_sessions.thanks_sent_at
      end,
      thanks_sent_by_member_id = case
        when repreparation_required then null
        else daily_sessions.thanks_sent_by_member_id
      end,
      thanks_sent_by_user_id = case
        when repreparation_required then null
        else daily_sessions.thanks_sent_by_user_id
      end,
      thanks_sent_by_display_name = case
        when repreparation_required then null
        else daily_sessions.thanks_sent_by_display_name
      end,
      thanks_received_by_member_id = case
        when repreparation_required then null
        else daily_sessions.thanks_received_by_member_id
      end,
      thanks_received_by_user_id = case
        when repreparation_required then null
        else daily_sessions.thanks_received_by_user_id
      end,
      thanks_received_by_display_name = case
        when repreparation_required then null
        else daily_sessions.thanks_received_by_display_name
      end,
      version = daily_sessions.version + 1'
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    '        or daily_sessions.prepared_at > daily_sessions.checked_at
      )',
    '        or daily_sessions.prepared_at > daily_sessions.checked_at
        or repreparation_required
      )'
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    item_reset_anchor,
    item_reset_sql
  );

  if patched_definition = function_definition
    or pg_catalog.strpos(
      patched_definition,
      'or repreparation_required'
    ) = 0
    or pg_catalog.strpos(
      patched_definition,
      'when repreparation_required then null'
    ) = 0
    or pg_catalog.strpos(
      patched_definition,
      'daily_sessions.prepared_at > daily_sessions.checked_at
        or repreparation_required'
    ) = 0
    or pg_catalog.strpos(
      patched_definition,
      'if updated_session_id is not null and repreparation_required then'
    ) = 0
  then
    raise exception 'daily_check_repreparation_contract_not_found';
  end if;

  execute patched_definition;
end;
$migration$;

comment on function public.complete_daily_check(uuid, uuid, date, integer) is
  'Completes or refreshes a check and reopens preparation only when canonical daily items contain a new preparation target.';

commit;
