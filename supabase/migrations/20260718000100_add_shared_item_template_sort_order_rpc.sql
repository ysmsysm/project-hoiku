create or replace function public.update_family_item_template_sort_orders(
  p_family_id uuid,
  p_child_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_child_id uuid;
  item_payload jsonb;
  object_key text;
  item_id_text text;
  item_id uuid;
  item_sort_order_numeric numeric;
  item_sort_order integer;
  item_ids uuid[] := array[]::uuid[];
  sort_orders integer[] := array[]::integer[];
  db_item_ids uuid[] := array[]::uuid[];
  input_item_count integer;
  active_item_count integer;
  updated_count integer;
  item_index integer;
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = '28000';
  end if;

  if not public.is_family_member(p_family_id) then
    raise exception 'not_family_member'
      using errcode = '42501';
  end if;

  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_item_sort_orders'
      using errcode = '22023';
  end if;

  input_item_count := pg_catalog.jsonb_array_length(p_items);

  if input_item_count > 200 then
    raise exception 'invalid_item_sort_order_count'
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

  for item_payload in
    select value
    from pg_catalog.jsonb_array_elements(p_items) as item_rows(value)
  loop
    if pg_catalog.jsonb_typeof(item_payload) <> 'object' then
      raise exception 'invalid_item_sort_order'
        using errcode = '22023';
    end if;

    for object_key in
      select key
      from pg_catalog.jsonb_object_keys(item_payload) as keys(key)
    loop
      if object_key not in ('id', 'sortOrder') then
        raise exception 'invalid_item_sort_order_unexpected_key:%', object_key
          using errcode = '22023';
      end if;
    end loop;

    if pg_catalog.jsonb_typeof(item_payload -> 'id') <> 'string' then
      raise exception 'invalid_item_template_id'
        using errcode = '22023';
    end if;

    item_id_text := pg_catalog.btrim(item_payload ->> 'id');

    if item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid_item_template_id'
        using errcode = '22023';
    end if;

    item_id := item_id_text::uuid;

    if item_id = any(item_ids) then
      raise exception 'duplicate_item_template_id'
        using errcode = '23505';
    end if;

    if pg_catalog.jsonb_typeof(item_payload -> 'sortOrder') <> 'number' then
      raise exception 'invalid_item_template_sort_order'
        using errcode = '22023';
    end if;

    item_sort_order_numeric := (item_payload ->> 'sortOrder')::numeric;

    if item_sort_order_numeric <> pg_catalog.trunc(item_sort_order_numeric) then
      raise exception 'invalid_item_template_sort_order'
        using errcode = '22023';
    end if;

    item_sort_order := item_sort_order_numeric::integer;

    if item_sort_order < 0 or item_sort_order > 100000 then
      raise exception 'invalid_item_template_sort_order'
        using errcode = '22023';
    end if;

    if item_sort_order = any(sort_orders) then
      raise exception 'duplicate_item_template_sort_order'
        using errcode = '23505';
    end if;

    item_ids := pg_catalog.array_append(item_ids, item_id);
    sort_orders := pg_catalog.array_append(sort_orders, item_sort_order);
  end loop;

  if exists (
    select 1
    from pg_catalog.generate_series(0, input_item_count - 1) as expected_orders(sort_order)
    where not expected_orders.sort_order = any(sort_orders)
  ) then
    raise exception 'invalid_item_template_sort_order_sequence'
      using errcode = '22023';
  end if;

  with locked_items as (
    select item_templates.id
    from public.item_templates
    where item_templates.family_id = p_family_id
      and item_templates.child_id = p_child_id
      and item_templates.is_active = true
    order by item_templates.id
    for update
  )
  select
    coalesce(pg_catalog.array_agg(locked_items.id order by locked_items.id), array[]::uuid[]),
    pg_catalog.count(*)::integer
  into db_item_ids, active_item_count
  from locked_items;

  if input_item_count <> active_item_count then
    raise exception 'item_template_sort_order_set_mismatch'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(item_ids) as input_ids(id)
    where not input_ids.id = any(db_item_ids)
  ) or exists (
    select 1
    from pg_catalog.unnest(db_item_ids) as active_ids(id)
    where not active_ids.id = any(item_ids)
  ) then
    raise exception 'item_template_sort_order_set_mismatch'
      using errcode = '22023';
  end if;

  if pg_catalog.cardinality(item_ids) > 0 then
    for item_index in 1..pg_catalog.cardinality(item_ids)
    loop
      update public.item_templates
      set
        sort_order = sort_orders[item_index],
        updated_at = now()
      where item_templates.id = item_ids[item_index]
        and item_templates.family_id = p_family_id
        and item_templates.child_id = p_child_id
        and item_templates.is_active = true;

      get diagnostics updated_count = row_count;

      if updated_count <> 1 then
        raise exception 'item_template_sort_order_update_failed'
          using errcode = 'P0001';
      end if;
    end loop;
  end if;
end;
$$;

comment on function public.update_family_item_template_sort_orders(
  uuid,
  uuid,
  jsonb
) is
  'Atomically updates active item template sort_order values for one shared child.';

revoke all on function public.update_family_item_template_sort_orders(
  uuid,
  uuid,
  jsonb
) from public;
revoke all on function public.update_family_item_template_sort_orders(
  uuid,
  uuid,
  jsonb
) from anon;
revoke all on function public.update_family_item_template_sort_orders(
  uuid,
  uuid,
  jsonb
) from authenticated;
grant execute on function public.update_family_item_template_sort_orders(
  uuid,
  uuid,
  jsonb
) to authenticated;
