create or replace function public.add_family_item_template(
  p_family_id uuid,
  p_child_id uuid,
  p_kind text,
  p_name text,
  p_default_quantity integer,
  p_unit text,
  p_current_rough_state text default null
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
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = '28000';
  end if;

  if not public.is_family_member(p_family_id) then
    raise exception 'not_family_member'
      using errcode = '42501';
  end if;

  if p_kind is null or p_kind not in ('regular', 'rough') then
    raise exception 'invalid_item_kind'
      using errcode = '22023';
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

  if p_unit is null
    or pg_catalog.char_length(p_unit) > 10
  then
    raise exception 'invalid_item_unit'
      using errcode = '22023';
  end if;

  if p_kind = 'regular' and p_current_rough_state is not null then
    raise exception 'invalid_item_rough_state'
      using errcode = '22023';
  end if;

  if p_kind = 'rough'
    and (
      p_current_rough_state is null
      or p_current_rough_state <> 'enough'
    )
  then
    raise exception 'invalid_item_rough_state'
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

  select coalesce(pg_catalog.max(item_templates.sort_order), -1) + 1
  into next_sort_order
  from public.item_templates
  where item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id
    and item_templates.is_active = true;

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
    p_kind,
    trimmed_name,
    p_default_quantity,
    p_unit,
    null,
    next_sort_order,
    p_current_rough_state,
    true
  )
  returning inserted_item.id into new_item_template_id;

  id := new_item_template_id;
  sort_order := next_sort_order;
  return next;
end;
$$;

comment on function public.add_family_item_template(
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  text
) is
  'Atomically appends a shared regular or rough item template using active item sort_order for one child.';

revoke all on function public.add_family_item_template(
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  text
) from public;
revoke all on function public.add_family_item_template(
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  text
) from anon;
revoke all on function public.add_family_item_template(
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  text
) from authenticated;

grant execute on function public.add_family_item_template(
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  text
) to authenticated;
