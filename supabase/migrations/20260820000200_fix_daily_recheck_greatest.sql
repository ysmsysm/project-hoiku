begin;

do $migration$
declare
  function_definition text;
  patched_definition text;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.complete_daily_check(uuid,uuid,date,integer)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    'pg_catalog.greatest(',
    'greatest('
  );

  if patched_definition = function_definition
    or pg_catalog.strpos(
      patched_definition,
      'checked_at = greatest('
    ) = 0
    or pg_catalog.strpos(
      patched_definition,
      'pg_catalog.greatest('
    ) > 0
  then
    raise exception 'daily_check_recheck_greatest_contract_not_found';
  end if;

  execute patched_definition;
end;
$migration$;

comment on function public.complete_daily_check(uuid, uuid, date, integer) is
  'Completes an initial check or refreshes a stale check after preparation, preserving preparation state with session locking and expected-version protection.';

commit;
