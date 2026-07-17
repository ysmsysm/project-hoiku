create or replace function public.update_family_spot_item_template_weekdays(
  p_family_id uuid,
  p_child_id uuid,
  p_item_template_id uuid,
  p_weekdays smallint[] default array[]::smallint[],
  p_name text default null,
  p_default_quantity integer default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_child_id uuid;
  locked_item_template_id uuid;
  trimmed_name text;
  weekday_value smallint;
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = '28000';
  end if;

  if not public.is_family_member(p_family_id) then
    raise exception 'not_family_member'
      using errcode = '42501';
  end if;

  if p_weekdays is null or pg_catalog.cardinality(p_weekdays) > 7 then
    raise exception 'invalid_item_weekdays'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_weekdays) as weekday_rows(weekday)
    where weekday is null or weekday < 0 or weekday > 6
  ) then
    raise exception 'invalid_item_weekday'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.unnest(p_weekdays) as weekday_rows(weekday)
  ) <> (
    select pg_catalog.count(distinct weekday)
    from pg_catalog.unnest(p_weekdays) as weekday_rows(weekday)
  ) then
    raise exception 'duplicate_item_weekday'
      using errcode = '23505';
  end if;

  if p_name is not null then
    trimmed_name := pg_catalog.btrim(p_name);

    if trimmed_name is null
      or pg_catalog.char_length(trimmed_name) < 1
      or pg_catalog.char_length(trimmed_name) > 80
    then
      raise exception 'invalid_item_name'
        using errcode = '22023';
    end if;
  end if;

  if p_default_quantity is not null
    and (p_default_quantity < 0 or p_default_quantity > 5)
  then
    raise exception 'invalid_item_count'
      using errcode = '22023';
  end if;

  select children.id
  into locked_child_id
  from public.children
  where children.id = p_child_id
    and children.family_id = p_family_id
  for update;

  if locked_child_id is null then
    raise exception 'child_not_found'
      using errcode = 'P0001';
  end if;

  select item_templates.id
  into locked_item_template_id
  from public.item_templates
  where item_templates.id = p_item_template_id
    and item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id
    and item_templates.kind = 'spot'
    and item_templates.is_active = true
  for update;

  if locked_item_template_id is null then
    raise exception 'spot_item_template_not_found'
      using errcode = 'P0001';
  end if;

  update public.item_templates
  set
    name = coalesce(trimmed_name, item_templates.name),
    default_quantity = coalesce(p_default_quantity, item_templates.default_quantity),
    updated_at = now()
  where item_templates.id = p_item_template_id
    and item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id
    and item_templates.kind = 'spot'
    and item_templates.is_active = true;

  delete from public.item_template_weekdays
  where item_template_weekdays.item_template_id = p_item_template_id
    and item_template_weekdays.family_id = p_family_id;

  foreach weekday_value in array p_weekdays
  loop
    insert into public.item_template_weekdays (
      item_template_id,
      family_id,
      weekday
    )
    values (
      p_item_template_id,
      p_family_id,
      weekday_value
    );
  end loop;
end;
$$;

comment on function public.update_family_spot_item_template_weekdays(
  uuid,
  uuid,
  uuid,
  smallint[],
  text,
  integer
) is
  'Atomically saves shared spot item edits. The RPC name reflects weekday editing, but it also updates name and quantity in the same transaction to avoid partial saves.';

revoke all on function public.update_family_spot_item_template_weekdays(
  uuid,
  uuid,
  uuid,
  smallint[],
  text,
  integer
) from public;
revoke all on function public.update_family_spot_item_template_weekdays(
  uuid,
  uuid,
  uuid,
  smallint[],
  text,
  integer
) from anon;
revoke all on function public.update_family_spot_item_template_weekdays(
  uuid,
  uuid,
  uuid,
  smallint[],
  text,
  integer
) from authenticated;
grant execute on function public.update_family_spot_item_template_weekdays(
  uuid,
  uuid,
  uuid,
  smallint[],
  text,
  integer
) to authenticated;
