begin;

do $migration$
declare
  function_definition text;
  patched_definition text;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.update_family_rough_item_state(uuid,uuid,uuid,timestamptz,text)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    'pg_catalog.coalesce(',
    'coalesce('
  );
  if patched_definition = function_definition then
    raise exception 'rough_state_coalesce_call_not_found';
  end if;
  execute patched_definition;

  function_definition := pg_catalog.pg_get_functiondef(
    'public.mutate_daily_spot_item(uuid,uuid,date,text,uuid,integer,uuid,text,integer,date)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    'pg_catalog.coalesce(pg_catalog.max(daily_items.sort_order), -1)',
    'coalesce(pg_catalog.max(daily_items.sort_order), -1)'
  );
  if patched_definition = function_definition then
    raise exception 'daily_spot_coalesce_call_not_found';
  end if;
  execute patched_definition;
end;
$migration$;

alter function public.mutate_daily_spot_item(
  uuid, uuid, date, text, uuid, integer, uuid, text, integer, date
) owner to postgres;
alter function public.mutate_daily_spot_item(
  uuid, uuid, date, text, uuid, integer, uuid, text, integer, date
) security definer;
alter function public.mutate_daily_spot_item(
  uuid, uuid, date, text, uuid, integer, uuid, text, integer, date
) set search_path = '';

revoke all on function public.mutate_daily_spot_item(
  uuid, uuid, date, text, uuid, integer, uuid, text, integer, date
) from public, anon, authenticated;
grant execute on function public.mutate_daily_spot_item(
  uuid, uuid, date, text, uuid, integer, uuid, text, integer, date
) to authenticated;

commit;
