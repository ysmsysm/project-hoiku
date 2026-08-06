create or replace function public.update_family_item_template(
  p_family_id uuid,
  p_child_id uuid,
  p_item_template_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_default_quantity integer,
  p_unit text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_child_id uuid;
  target_template_id uuid;
  target_kind text;
  target_name text;
  target_default_quantity integer;
  target_unit text;
  target_current_rough_state text;
  target_sort_order integer;
  target_is_active boolean;
  target_updated_at timestamptz;
  target_weekdays smallint[];
  trimmed_name text;
  changed boolean;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null
    );
  end if;

  if p_family_id is null
    or p_child_id is null
    or p_item_template_id is null
    or p_expected_updated_at is null
    or p_name is null
    or p_default_quantity is null
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'invalid_input'
    );
  end if;

  trimmed_name := pg_catalog.btrim(p_name);

  if pg_catalog.char_length(trimmed_name) < 1
    or pg_catalog.char_length(trimmed_name) > 80
    or p_default_quantity < 0
    or p_default_quantity > 5
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'invalid_input'
    );
  end if;

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null
    );
  end if;

  select children.id
  into locked_child_id
  from public.children
  where children.id = p_child_id
    and children.family_id = p_family_id
  for update;

  if locked_child_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null
    );
  end if;

  select
    item_templates.id,
    item_templates.kind,
    item_templates.name,
    item_templates.default_quantity,
    item_templates.unit,
    item_templates.current_rough_state,
    item_templates.sort_order,
    item_templates.is_active,
    item_templates.updated_at
  into
    target_template_id,
    target_kind,
    target_name,
    target_default_quantity,
    target_unit,
    target_current_rough_state,
    target_sort_order,
    target_is_active,
    target_updated_at
  from public.item_templates
  where item_templates.id = p_item_template_id
    and item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id
  for update;

  if target_template_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'changed', false,
      'reason', null
    );
  end if;

  if not target_is_active then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'inactive_template'
    );
  end if;

  if target_kind not in ('regular', 'rough') then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'wrong_kind'
    );
  end if;

  if (target_kind = 'regular' and p_unit is not null)
    or (
      target_kind = 'rough'
      and (
        p_unit is null
        or pg_catalog.char_length(p_unit) > 10
      )
    )
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'invalid_input'
    );
  end if;

  if target_updated_at is distinct from p_expected_updated_at then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'changed', false,
      'reason', 'stale_template'
    );
  end if;

  select pg_catalog.coalesce(
    pg_catalog.array_agg(
      item_template_weekdays.weekday
      order by item_template_weekdays.weekday
    ),
    array[]::smallint[]
  )
  into target_weekdays
  from public.item_template_weekdays
  where item_template_weekdays.item_template_id = target_template_id
    and item_template_weekdays.family_id = p_family_id;

  changed := target_name is distinct from trimmed_name
    or target_default_quantity is distinct from p_default_quantity
    or (
      target_kind = 'rough'
      and target_unit is distinct from p_unit
    );

  if changed then
    if target_kind = 'regular' then
      update public.item_templates
      set
        name = trimmed_name,
        default_quantity = p_default_quantity
      where item_templates.id = target_template_id
        and item_templates.family_id = p_family_id
        and item_templates.child_id = p_child_id
        and item_templates.kind = 'regular'
        and item_templates.is_active = true
      returning
        item_templates.name,
        item_templates.default_quantity,
        item_templates.unit,
        item_templates.updated_at
      into
        target_name,
        target_default_quantity,
        target_unit,
        target_updated_at;
    else
      update public.item_templates
      set
        name = trimmed_name,
        default_quantity = p_default_quantity,
        unit = p_unit
      where item_templates.id = target_template_id
        and item_templates.family_id = p_family_id
        and item_templates.child_id = p_child_id
        and item_templates.kind = 'rough'
        and item_templates.is_active = true
      returning
        item_templates.name,
        item_templates.default_quantity,
        item_templates.unit,
        item_templates.updated_at
      into
        target_name,
        target_default_quantity,
        target_unit,
        target_updated_at;
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'success',
    'changed', changed,
    'reason', null,
    'family_id', p_family_id,
    'child_id', p_child_id,
    'item_template_id', target_template_id,
    'kind', target_kind,
    'name', target_name,
    'default_quantity', target_default_quantity,
    'unit', target_unit,
    'current_rough_state', target_current_rough_state,
    'weekdays', target_weekdays,
    'sort_order', target_sort_order,
    'is_active', target_is_active,
    'updated_at', target_updated_at
  );
end;
$$;

create or replace function public.update_family_rough_item_state(
  p_family_id uuid,
  p_child_id uuid,
  p_item_template_id uuid,
  p_expected_updated_at timestamptz,
  p_current_rough_state text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_child_id uuid;
  target_template_id uuid;
  target_kind text;
  target_name text;
  target_default_quantity integer;
  target_unit text;
  target_current_rough_state text;
  target_sort_order integer;
  target_is_active boolean;
  target_updated_at timestamptz;
  target_weekdays smallint[];
  changed boolean;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null
    );
  end if;

  if p_family_id is null
    or p_child_id is null
    or p_item_template_id is null
    or p_expected_updated_at is null
    or p_current_rough_state is null
    or p_current_rough_state not in ('enough', 'low', 'refill')
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'invalid_input'
    );
  end if;

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null
    );
  end if;

  select children.id
  into locked_child_id
  from public.children
  where children.id = p_child_id
    and children.family_id = p_family_id
  for update;

  if locked_child_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null
    );
  end if;

  select
    item_templates.id,
    item_templates.kind,
    item_templates.name,
    item_templates.default_quantity,
    item_templates.unit,
    item_templates.current_rough_state,
    item_templates.sort_order,
    item_templates.is_active,
    item_templates.updated_at
  into
    target_template_id,
    target_kind,
    target_name,
    target_default_quantity,
    target_unit,
    target_current_rough_state,
    target_sort_order,
    target_is_active,
    target_updated_at
  from public.item_templates
  where item_templates.id = p_item_template_id
    and item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id
  for update;

  if target_template_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'changed', false,
      'reason', null
    );
  end if;

  if not target_is_active then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'inactive_template'
    );
  end if;

  if target_kind <> 'rough' then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'wrong_kind'
    );
  end if;

  if target_updated_at is distinct from p_expected_updated_at then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'changed', false,
      'reason', 'stale_template'
    );
  end if;

  select pg_catalog.coalesce(
    pg_catalog.array_agg(
      item_template_weekdays.weekday
      order by item_template_weekdays.weekday
    ),
    array[]::smallint[]
  )
  into target_weekdays
  from public.item_template_weekdays
  where item_template_weekdays.item_template_id = target_template_id
    and item_template_weekdays.family_id = p_family_id;

  changed := target_current_rough_state is distinct from p_current_rough_state;

  if changed then
    update public.item_templates
    set current_rough_state = p_current_rough_state
    where item_templates.id = target_template_id
      and item_templates.family_id = p_family_id
      and item_templates.child_id = p_child_id
      and item_templates.kind = 'rough'
      and item_templates.is_active = true
    returning
      item_templates.current_rough_state,
      item_templates.updated_at
    into
      target_current_rough_state,
      target_updated_at;
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'success',
    'changed', changed,
    'reason', null,
    'family_id', p_family_id,
    'child_id', p_child_id,
    'item_template_id', target_template_id,
    'kind', target_kind,
    'name', target_name,
    'default_quantity', target_default_quantity,
    'unit', target_unit,
    'current_rough_state', target_current_rough_state,
    'weekdays', target_weekdays,
    'sort_order', target_sort_order,
    'is_active', target_is_active,
    'updated_at', target_updated_at
  );
end;
$$;

create or replace function public.update_family_spot_item_template(
  p_family_id uuid,
  p_child_id uuid,
  p_item_template_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_default_quantity integer,
  p_weekdays smallint[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  locked_child_id uuid;
  target_template_id uuid;
  target_kind text;
  target_name text;
  target_default_quantity integer;
  target_unit text;
  target_current_rough_state text;
  target_sort_order integer;
  target_is_active boolean;
  target_updated_at timestamptz;
  target_weekdays smallint[];
  normalized_weekdays smallint[];
  trimmed_name text;
  weekday_value smallint;
  changed boolean;
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null
    );
  end if;

  if p_family_id is null
    or p_child_id is null
    or p_item_template_id is null
    or p_expected_updated_at is null
    or p_name is null
    or p_default_quantity is null
    or p_weekdays is null
    or pg_catalog.cardinality(p_weekdays) > 7
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'invalid_input'
    );
  end if;

  trimmed_name := pg_catalog.btrim(p_name);

  if pg_catalog.char_length(trimmed_name) < 1
    or pg_catalog.char_length(trimmed_name) > 80
    or p_default_quantity < 0
    or p_default_quantity > 5
    or exists (
      select 1
      from pg_catalog.unnest(p_weekdays) as weekday_rows(weekday)
      where weekday_rows.weekday is null
        or weekday_rows.weekday < 0
        or weekday_rows.weekday > 6
    )
    or (
      select pg_catalog.count(*)
      from pg_catalog.unnest(p_weekdays) as weekday_rows(weekday)
    ) <> (
      select pg_catalog.count(distinct weekday_rows.weekday)
      from pg_catalog.unnest(p_weekdays) as weekday_rows(weekday)
    )
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'invalid_input'
    );
  end if;

  select pg_catalog.coalesce(
    pg_catalog.array_agg(
      weekday_rows.weekday
      order by weekday_rows.weekday
    ),
    array[]::smallint[]
  )
  into normalized_weekdays
  from pg_catalog.unnest(p_weekdays) as weekday_rows(weekday);

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null
    );
  end if;

  select children.id
  into locked_child_id
  from public.children
  where children.id = p_child_id
    and children.family_id = p_family_id
  for update;

  if locked_child_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'changed', false,
      'reason', null
    );
  end if;

  select
    item_templates.id,
    item_templates.kind,
    item_templates.name,
    item_templates.default_quantity,
    item_templates.unit,
    item_templates.current_rough_state,
    item_templates.sort_order,
    item_templates.is_active,
    item_templates.updated_at
  into
    target_template_id,
    target_kind,
    target_name,
    target_default_quantity,
    target_unit,
    target_current_rough_state,
    target_sort_order,
    target_is_active,
    target_updated_at
  from public.item_templates
  where item_templates.id = p_item_template_id
    and item_templates.family_id = p_family_id
    and item_templates.child_id = p_child_id
  for update;

  if target_template_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'changed', false,
      'reason', null
    );
  end if;

  if not target_is_active then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'inactive_template'
    );
  end if;

  if target_kind <> 'spot' then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'changed', false,
      'reason', 'wrong_kind'
    );
  end if;

  if target_updated_at is distinct from p_expected_updated_at then
    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'changed', false,
      'reason', 'stale_template'
    );
  end if;

  perform item_template_weekdays.item_template_id
  from public.item_template_weekdays
  where item_template_weekdays.item_template_id = target_template_id
    and item_template_weekdays.family_id = p_family_id
  order by item_template_weekdays.weekday
  for update;

  select pg_catalog.coalesce(
    pg_catalog.array_agg(
      item_template_weekdays.weekday
      order by item_template_weekdays.weekday
    ),
    array[]::smallint[]
  )
  into target_weekdays
  from public.item_template_weekdays
  where item_template_weekdays.item_template_id = target_template_id
    and item_template_weekdays.family_id = p_family_id;

  changed := target_name is distinct from trimmed_name
    or target_default_quantity is distinct from p_default_quantity
    or target_weekdays is distinct from normalized_weekdays;

  if changed then
    update public.item_templates
    set
      name = trimmed_name,
      default_quantity = p_default_quantity
    where item_templates.id = target_template_id
      and item_templates.family_id = p_family_id
      and item_templates.child_id = p_child_id
      and item_templates.kind = 'spot'
      and item_templates.is_active = true
    returning
      item_templates.name,
      item_templates.default_quantity,
      item_templates.updated_at
    into
      target_name,
      target_default_quantity,
      target_updated_at;

    delete from public.item_template_weekdays
    where item_template_weekdays.item_template_id = target_template_id
      and item_template_weekdays.family_id = p_family_id;

    foreach weekday_value in array normalized_weekdays
    loop
      insert into public.item_template_weekdays (
        item_template_id,
        family_id,
        weekday
      )
      values (
        target_template_id,
        p_family_id,
        weekday_value
      );
    end loop;

    target_weekdays := normalized_weekdays;
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'success',
    'changed', changed,
    'reason', null,
    'family_id', p_family_id,
    'child_id', p_child_id,
    'item_template_id', target_template_id,
    'kind', target_kind,
    'name', target_name,
    'default_quantity', target_default_quantity,
    'unit', target_unit,
    'current_rough_state', target_current_rough_state,
    'weekdays', target_weekdays,
    'sort_order', target_sort_order,
    'is_active', target_is_active,
    'updated_at', target_updated_at
  );
end;
$$;

comment on function public.update_family_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  text
) is
  'Updates one active shared regular or rough template after child locking and an updated_at concurrency check.';

comment on function public.update_family_rough_item_state(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text
) is
  'Updates one active shared rough template state after child locking and an updated_at concurrency check.';

comment on function public.update_family_spot_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  smallint[]
) is
  'Atomically updates one active shared spot template and its weekday set after child locking and an updated_at concurrency check.';

revoke all on function public.update_family_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  text
) from public;
revoke all on function public.update_family_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  text
) from anon;
revoke all on function public.update_family_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  text
) from authenticated;
grant execute on function public.update_family_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  text
) to authenticated;

revoke all on function public.update_family_rough_item_state(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text
) from public;
revoke all on function public.update_family_rough_item_state(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text
) from anon;
revoke all on function public.update_family_rough_item_state(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text
) from authenticated;
grant execute on function public.update_family_rough_item_state(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text
) to authenticated;

revoke all on function public.update_family_spot_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  smallint[]
) from public;
revoke all on function public.update_family_spot_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  smallint[]
) from anon;
revoke all on function public.update_family_spot_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  smallint[]
) from authenticated;
grant execute on function public.update_family_spot_item_template(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  integer,
  smallint[]
) to authenticated;
