begin;

do $migration$
declare
  function_definition text;
  patched_definition text;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.mutate_daily_spot_item(uuid,uuid,date,text,uuid,integer,uuid,text,integer,date)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    'if target_session_prepared then',
    'if target_session_prepared
    and p_action not in (''add_template'', ''add_temporary'')
  then'
  );
  if patched_definition = function_definition then
    raise exception 'daily_spot_prepared_guard_not_found';
  end if;
  execute patched_definition;
end;
$migration$;

commit;
