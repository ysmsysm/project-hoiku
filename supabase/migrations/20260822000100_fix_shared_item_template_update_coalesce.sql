begin;

do $migration$
declare
  function_definition text;
  patched_definition text;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.update_family_item_template(uuid,uuid,uuid,timestamptz,text,integer,text)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    'pg_catalog.coalesce(',
    'coalesce('
  );
  if patched_definition = function_definition then
    raise exception 'item_template_update_coalesce_call_not_found';
  end if;
  execute patched_definition;
end;
$migration$;

commit;
