create or replace function public.add_family_spot_item_template(
  p_family_id uuid,
  p_child_id uuid,
  p_name text,
  p_default_quantity integer,
  p_weekdays smallint[] default array[]::smallint[]
)
returns table (
  id uuid,
  sort_order integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  trimmed_name text;
  locked_child_id uuid;
  next_sort_order integer;
  new_item_template_id uuid;
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

  trimmed_name := pg_catalog.btrim(p_name);

  if trimmed_name is null
    or pg_catalog.char_length(trimmed_name) < 1
    or pg_catalog.char_length(trimmed_name) > 80
  then
    raise exception 'invalid_item_name'
      using errcode = '22023';
  end if;

  if p_default_quantity is null
    or p_default_quantity < 0
    or p_default_quantity > 5
  then
    raise exception 'invalid_item_count'
      using errcode = '22023';
  end if;

  if p_weekdays is null or pg_catalog.cardinality(p_weekdays) > 2 then
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

  select coalesce(pg_catalog.max(item_templates.sort_order), -1) + 1
  into next_sort_order
  from public.item_templates
  where item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id;

  if next_sort_order < 0 or next_sort_order > 100000 then
    raise exception 'invalid_item_sort_order'
      using errcode = '22023';
  end if;

  insert into public.item_templates as inserted_item (
    family_id,
    child_id,
    kind,
    name,
    default_quantity,
    unit,
    weekday,
    sort_order,
    current_rough_state,
    is_active
  )
  values (
    p_family_id,
    p_child_id,
    'spot',
    trimmed_name,
    p_default_quantity,
    '個',
    null,
    next_sort_order,
    null,
    true
  )
  returning inserted_item.id into new_item_template_id;

  foreach weekday_value in array p_weekdays
  loop
    insert into public.item_template_weekdays (
      item_template_id,
      family_id,
      weekday
    )
    values (
      new_item_template_id,
      p_family_id,
      weekday_value
    );
  end loop;

  id := new_item_template_id;
  sort_order := next_sort_order;
  return next;
end;
$$;

revoke all on function public.add_family_spot_item_template(
  uuid,
  uuid,
  text,
  integer,
  smallint[]
) from public;
revoke all on function public.add_family_spot_item_template(
  uuid,
  uuid,
  text,
  integer,
  smallint[]
) from anon;
revoke all on function public.add_family_spot_item_template(
  uuid,
  uuid,
  text,
  integer,
  smallint[]
) from authenticated;

grant execute on function public.add_family_spot_item_template(
  uuid,
  uuid,
  text,
  integer,
  smallint[]
) to authenticated;
