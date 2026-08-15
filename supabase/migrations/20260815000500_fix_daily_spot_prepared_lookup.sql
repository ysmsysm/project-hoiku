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
    'daily_sessions.id, daily_sessions.is_prepared',
    'daily_sessions.id, daily_sessions.prepared_at is not null'
  );
  if patched_definition = function_definition then
    raise exception 'daily_spot_prepared_lookup_not_found';
  end if;
  execute patched_definition;
end;
$migration$;

commit;
