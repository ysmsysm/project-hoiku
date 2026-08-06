-- Template writes must pass through the family-scoped RPC contracts below.
-- ALTER FUNCTION preserves each function's signature and body while allowing the
-- functions to keep writing after direct table mutations are revoked from clients.

alter function public.add_family_item_template(
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  text
) owner to postgres;
alter function public.add_family_item_template(
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  text
) security definer;
alter function public.add_family_item_template(
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  text
) set search_path = '';

alter function public.add_family_spot_item_template(
  uuid,
  uuid,
  text,
  integer,
  smallint[]
) owner to postgres;
alter function public.add_family_spot_item_template(
  uuid,
  uuid,
  text,
  integer,
  smallint[]
) security definer;
alter function public.add_family_spot_item_template(
  uuid,
  uuid,
  text,
  integer,
  smallint[]
) set search_path = '';

alter function public.update_family_spot_item_template_weekdays(
  uuid,
  uuid,
  uuid,
  smallint[],
  text,
  integer
) owner to postgres;
alter function public.update_family_spot_item_template_weekdays(
  uuid,
  uuid,
  uuid,
  smallint[],
  text,
  integer
) security definer;
alter function public.update_family_spot_item_template_weekdays(
  uuid,
  uuid,
  uuid,
  smallint[],
  text,
  integer
) set search_path = '';

alter function public.update_family_item_template_sort_orders(
  uuid,
  uuid,
  jsonb
) owner to postgres;
alter function public.update_family_item_template_sort_orders(
  uuid,
  uuid,
  jsonb
) security definer;
alter function public.update_family_item_template_sort_orders(
  uuid,
  uuid,
  jsonb
) set search_path = '';

alter function public.delete_family_item_template_for_day(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz,
  uuid,
  integer
) owner to postgres;
alter function public.delete_family_item_template_for_day(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz,
  uuid,
  integer
) security definer;
alter function public.delete_family_item_template_for_day(
  uuid,
  uuid,
  date,
  uuid,
  timestamptz,
  uuid,
  integer
) set search_path = '';

alter function public.update_family_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  text
) owner to postgres;
alter function public.update_family_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  text
) security definer;
alter function public.update_family_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  text
) set search_path = '';

alter function public.update_family_rough_item_state(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text
) owner to postgres;
alter function public.update_family_rough_item_state(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text
) security definer;
alter function public.update_family_rough_item_state(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text
) set search_path = '';

alter function public.update_family_spot_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  smallint[]
) owner to postgres;
alter function public.update_family_spot_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  smallint[]
) security definer;
alter function public.update_family_spot_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  smallint[]
) set search_path = '';

revoke all on function public.add_family_item_template(uuid, uuid, text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.add_family_item_template(uuid, uuid, text, text, integer, text, text)
  to authenticated;

revoke all on function public.add_family_spot_item_template(uuid, uuid, text, integer, smallint[])
  from public, anon, authenticated;
grant execute on function public.add_family_spot_item_template(uuid, uuid, text, integer, smallint[])
  to authenticated;

revoke all on function public.update_family_spot_item_template_weekdays(uuid, uuid, uuid, smallint[], text, integer)
  from public, anon, authenticated;
grant execute on function public.update_family_spot_item_template_weekdays(uuid, uuid, uuid, smallint[], text, integer)
  to authenticated;

revoke all on function public.update_family_item_template_sort_orders(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_family_item_template_sort_orders(uuid, uuid, jsonb)
  to authenticated;

revoke all on function public.delete_family_item_template_for_day(uuid, uuid, date, uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.delete_family_item_template_for_day(uuid, uuid, date, uuid, timestamptz, uuid, integer)
  to authenticated;

revoke all on function public.update_family_item_template(uuid, uuid, uuid, timestamptz, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.update_family_item_template(uuid, uuid, uuid, timestamptz, text, integer, text)
  to authenticated;

revoke all on function public.update_family_rough_item_state(uuid, uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.update_family_rough_item_state(uuid, uuid, uuid, timestamptz, text)
  to authenticated;

revoke all on function public.update_family_spot_item_template(uuid, uuid, uuid, timestamptz, text, integer, smallint[])
  from public, anon, authenticated;
grant execute on function public.update_family_spot_item_template(uuid, uuid, uuid, timestamptz, text, integer, smallint[])
  to authenticated;

-- Keep RLS-protected reads available while forcing all client writes through RPCs.
revoke insert, update, delete on table public.item_templates
  from public, anon, authenticated;
revoke insert, update, delete on table public.item_template_weekdays
  from public, anon, authenticated;
