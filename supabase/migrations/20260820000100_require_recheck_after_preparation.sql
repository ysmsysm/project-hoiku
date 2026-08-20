begin;

do $migration$
declare
  function_definition text;
  patched_definition text;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.complete_daily_check(uuid,uuid,date,integer)'::regprocedure
  );
  patched_definition := function_definition;

  patched_definition := pg_catalog.replace(
    patched_definition,
    '  target_session_checked_at timestamptz;
  target_session_version integer;',
    '  target_session_checked_at timestamptz;
  target_session_prepared_at timestamptz;
  target_session_version integer;'
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    '    daily_sessions.checked_at,
    daily_sessions.version
  into
    target_session_id,
    target_session_checked_at,
    target_session_version',
    '    daily_sessions.checked_at,
    daily_sessions.prepared_at,
    daily_sessions.version
  into
    target_session_id,
    target_session_checked_at,
    target_session_prepared_at,
    target_session_version'
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    '    and daily_sessions.session_date = p_session_date;

  if target_session_id is null then',
    '    and daily_sessions.session_date = p_session_date
  for update;

  if target_session_id is null then'
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    'if target_session_checked_at is null then',
    'if target_session_checked_at is null
    or target_session_prepared_at > target_session_checked_at
  then'
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    '      checked_at = now(),',
    '      checked_at = pg_catalog.greatest(
        pg_catalog.clock_timestamp(),
        daily_sessions.prepared_at + interval ''1 microsecond''
      ),'
  );
  patched_definition := pg_catalog.replace(
    patched_definition,
    '      and daily_sessions.checked_at is null
      and daily_sessions.version = p_expected_version',
    '      and (
        daily_sessions.checked_at is null
        or daily_sessions.prepared_at > daily_sessions.checked_at
      )
      and daily_sessions.version = p_expected_version'
  );

  if patched_definition = function_definition
    or pg_catalog.strpos(
      patched_definition,
      'target_session_prepared_at > target_session_checked_at'
    ) = 0
    or pg_catalog.strpos(patched_definition, 'for update;') = 0
  then
    raise exception 'daily_check_recheck_contract_not_found';
  end if;

  execute patched_definition;
end;
$migration$;

comment on function public.complete_daily_check(uuid, uuid, date, integer) is
  'Completes an initial check or refreshes a stale check after preparation, preserving preparation state with session locking and expected-version protection.';

commit;
