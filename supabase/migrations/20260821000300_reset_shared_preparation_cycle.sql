begin;

do $check_migration$
declare
  function_definition text;
  patched_definition text;
  old_detection text := $old$
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
$old$;
  new_detection text := $new$
  -- A same-day recheck starts a fresh local-equivalent preparation cycle only
  -- when the current canonical state still contains a real preparation target.
  select exists (
    select 1
    from public.daily_items
    where daily_items.family_id = p_family_id
      and daily_items.daily_session_id = target_session_id
      and daily_items.deleted_at is null
      and target_session_prepared_at is not null
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
          and daily_items.is_checked = false
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
$new$;
  old_reset text := $old$
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
$old$;
  new_reset text := $new$
      where daily_items.family_id = p_family_id
        and daily_items.daily_session_id = target_session_id
        and daily_items.deleted_at is null
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
            and daily_items.is_checked = false
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
        and (
          daily_items.is_prepared = true
          or daily_items.is_deferred = true
        );
$new$;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.complete_daily_check(uuid,uuid,date,integer)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    old_detection,
    new_detection
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    old_reset,
    new_reset
  );
  if patched_definition = function_definition
    or pg_catalog.strpos(patched_definition, new_detection) = 0
    or pg_catalog.strpos(patched_definition, new_reset) = 0
  then
    raise exception 'shared_preparation_cycle_reset_contract_not_found';
  end if;
  execute patched_definition;
end;
$check_migration$;

do $preparation_migration$
declare
  function_definition text;
  patched_definition text;
  carryover_anchor text := '  -- Carryover resolution is derived from successful daily completion.';
  spot_completion_sql text := $patch$
  -- A prepared, non-deferred spot has been consumed by this preparation
  -- cycle. is_checked distinguishes it from deferred and newly added spots
  -- without deleting carryover history.
  update public.daily_items
  set
    is_checked = true,
    updated_by_member_id = current_member_id,
    updated_by_user_id = current_user_id,
    updated_by_display_name = current_member_display_name,
    version = daily_items.version + 1
  where daily_items.family_id = p_family_id
    and daily_items.daily_session_id = target_session_id
    and daily_items.deleted_at is null
    and daily_items.kind = 'spot'
    and daily_items.is_prepared = true
    and daily_items.is_deferred = false
    and daily_items.is_checked = false;

$patch$;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.complete_daily_preparation(uuid,uuid,date,integer)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    carryover_anchor,
    spot_completion_sql || carryover_anchor
  );
  if patched_definition = function_definition
    or pg_catalog.strpos(patched_definition, spot_completion_sql) = 0
  then
    raise exception 'complete_preparation_spot_cycle_contract_not_found';
  end if;
  execute patched_definition;
end;
$preparation_migration$;

do $spot_migration$
declare
  function_definition text;
  patched_definition text;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.mutate_daily_spot_item(uuid,uuid,date,text,uuid,integer,uuid,text,integer,date)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    '          is_prepared = false,
          due_date = p_due_date,',
    '          is_checked = false,
          is_prepared = false,
          due_date = p_due_date,'
  );
  if patched_definition = function_definition then
    raise exception 'completed_spot_readd_cycle_contract_not_found';
  end if;
  execute patched_definition;
end;
$spot_migration$;

-- Existing completed prepared spots are completion results, not active items
-- in a later same-day cycle. Deferred rows remain untouched for carryover.
update public.daily_items
set
  is_checked = true,
  version = daily_items.version + 1
from public.daily_sessions
where daily_sessions.id = daily_items.daily_session_id
  and daily_sessions.family_id = daily_items.family_id
  and daily_sessions.prepared_at is not null
  and daily_items.deleted_at is null
  and daily_items.kind = 'spot'
  and daily_items.is_prepared = true
  and daily_items.is_deferred = false
  and daily_items.is_checked = false;

-- Repair a cycle that was already reopened by the former recheck contract.
-- Rows changed after the latest check belong to the current user's work and
-- are never rewritten.
update public.daily_items
set
  is_checked = true,
  version = daily_items.version + 1
from public.daily_sessions
where daily_sessions.id = daily_items.daily_session_id
  and daily_sessions.family_id = daily_items.family_id
  and daily_sessions.prepared_at is null
  and daily_sessions.checked_at is not null
  and daily_items.updated_at < daily_sessions.checked_at
  and daily_items.deleted_at is null
  and daily_items.kind = 'spot'
  and daily_items.is_prepared = true
  and daily_items.is_deferred = false
  and daily_items.is_checked = false;

update public.daily_items
set
  is_prepared = false,
  is_deferred = false,
  version = daily_items.version + 1
from public.daily_sessions
where daily_sessions.id = daily_items.daily_session_id
  and daily_sessions.family_id = daily_items.family_id
  and daily_sessions.prepared_at is null
  and daily_sessions.checked_at is not null
  and daily_items.updated_at < daily_sessions.checked_at
  and daily_items.deleted_at is null
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
      and daily_items.is_checked = false
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
  and (
    daily_items.is_prepared = true
    or daily_items.is_deferred = true
  );

comment on function public.complete_daily_check(uuid, uuid, date, integer) is
  'Completes or refreshes a check and starts a fresh preparation cycle only for current canonical preparation targets.';
comment on function public.complete_daily_preparation(uuid, uuid, date, integer) is
  'Completes checked preparation, reflects prepared regular, spot, and rough results, and resolves prepared carryovers atomically.';

commit;
