alter table public.families
  add column if not exists sharing_started_at timestamptz,
  add column if not exists sharing_started_by_member_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'families_sharing_started_by_member_family_fk'
      and conrelid = 'public.families'::regclass
  ) then
    alter table public.families
      add constraint families_sharing_started_by_member_family_fk
      foreign key (sharing_started_by_member_id, id)
      references public.family_members(id, family_id)
      on delete restrict
      not valid;
  end if;
end;
$$;

alter table public.families
  validate constraint families_sharing_started_by_member_family_fk;

alter table public.children
  add column if not exists icon_type text,
  add column if not exists icon_id text,
  add column if not exists icon_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'children_icon_type_check'
      and conrelid = 'public.children'::regclass
  ) then
    alter table public.children
      add constraint children_icon_type_check
      check (
        icon_type is null
        or icon_type in ('default', 'image')
      )
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'children_icon_id_check'
      and conrelid = 'public.children'::regclass
  ) then
    alter table public.children
      add constraint children_icon_id_check
      check (
        icon_id is null
        or icon_id = 'default-baby'
      )
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'children_icon_url_length_check'
      and conrelid = 'public.children'::regclass
  ) then
    alter table public.children
      add constraint children_icon_url_length_check
      check (
        icon_url is null
        or char_length(icon_url) <= 2048
      )
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'children_icon_consistency_check'
      and conrelid = 'public.children'::regclass
  ) then
    alter table public.children
      add constraint children_icon_consistency_check
      check (
        (
          icon_type is null
          and icon_id is null
          and icon_url is null
        )
        or (
          icon_type = 'default'
          and icon_id = 'default-baby'
          and icon_url is null
        )
        or (
          icon_type = 'image'
          and icon_id = 'default-baby'
          and icon_url is not null
        )
      )
      not valid;
  end if;
end;
$$;

alter table public.children validate constraint children_icon_type_check;
alter table public.children validate constraint children_icon_id_check;
alter table public.children validate constraint children_icon_url_length_check;
alter table public.children validate constraint children_icon_consistency_check;

alter table public.item_templates
  add column if not exists current_rough_state text;

do $$
begin
  if exists (
    select 1
    from public.item_templates
    where kind = 'rough'
      and current_rough_state is null
  ) then
    raise exception 'existing_rough_templates_without_current_rough_state'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.item_templates
    where kind <> 'rough'
      and current_rough_state is not null
  ) then
    raise exception 'existing_non_rough_templates_with_current_rough_state'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.item_templates
    where current_rough_state is not null
      and current_rough_state not in ('enough', 'low', 'refill')
  ) then
    raise exception 'existing_invalid_current_rough_state'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'item_templates_current_rough_state_strict_check'
      and conrelid = 'public.item_templates'::regclass
  ) then
    alter table public.item_templates
      add constraint item_templates_current_rough_state_strict_check
      check (
        (
          kind = 'rough'
          and current_rough_state in ('enough', 'low', 'refill')
        )
        or (
          kind <> 'rough'
          and current_rough_state is null
        )
      )
      not valid;
  end if;
end;
$$;

alter table public.item_templates
  validate constraint item_templates_current_rough_state_strict_check;

create table if not exists public.item_template_weekdays (
  item_template_id uuid not null,
  family_id uuid not null,
  weekday smallint not null,
  created_at timestamptz not null default now(),
  constraint item_template_weekdays_pkey
    primary key (item_template_id, weekday),
  constraint item_template_weekdays_weekday_check
    check (weekday between 0 and 6),
  constraint item_template_weekdays_template_family_fk
    foreign key (item_template_id, family_id)
    references public.item_templates(id, family_id)
    on delete cascade
);

create index if not exists item_template_weekdays_family_id_idx
  on public.item_template_weekdays(family_id);

alter table public.item_template_weekdays enable row level security;

revoke all on public.item_template_weekdays from public;
revoke all on public.item_template_weekdays from anon;
revoke all on public.item_template_weekdays from authenticated;

grant select, insert, update, delete
  on public.item_template_weekdays
  to authenticated;

drop policy if exists item_template_weekdays_select_family_members
  on public.item_template_weekdays;
drop policy if exists item_template_weekdays_insert_family_members
  on public.item_template_weekdays;
drop policy if exists item_template_weekdays_update_family_members
  on public.item_template_weekdays;
drop policy if exists item_template_weekdays_delete_family_members
  on public.item_template_weekdays;

create policy item_template_weekdays_select_family_members
  on public.item_template_weekdays
  for select
  to authenticated
  using (public.is_family_member(family_id));

create policy item_template_weekdays_insert_family_members
  on public.item_template_weekdays
  for insert
  to authenticated
  with check (public.is_family_member(family_id));

create policy item_template_weekdays_update_family_members
  on public.item_template_weekdays
  for update
  to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy item_template_weekdays_delete_family_members
  on public.item_template_weekdays
  for delete
  to authenticated
  using (public.is_family_member(family_id));

create or replace function public.start_family_data_sharing(
  payload jsonb
)
returns table (
  family_id uuid,
  child_id uuid,
  item_template_count integer,
  sharing_started_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();

  owner_member_id uuid;
  owner_family_id uuid;
  owner_role text;

  locked_sharing_started_at timestamptz;
  new_child_id uuid;
  started_at timestamptz;

  child_payload jsonb;
  child_name text;
  child_icon_type text;
  child_icon_id text;
  child_icon_url text;

  items_payload jsonb;
  item_payload jsonb;
  item_ordinal bigint;
  item_count integer;

  allowed_top_keys text[] := array['child', 'items'];
  allowed_child_keys text[] := array['name', 'iconType', 'iconId', 'iconUrl'];
  allowed_item_keys text[] := array[
    'localId',
    'name',
    'category',
    'count',
    'unit',
    'weekdays',
    'sortOrder',
    'roughState'
  ];

  object_key text;

  local_ids text[] := array[]::text[];
  item_local_id text;
  item_name text;
  item_category text;
  item_kind text;
  item_unit text;
  item_rough_state text;
  item_current_rough_state text;
  item_count_numeric numeric;
  item_default_quantity integer;
  item_sort_order_numeric numeric;
  item_sort_order integer;
  new_item_template_id uuid;

  weekdays_payload jsonb;
  weekday_payload jsonb;
  weekday_numeric numeric;
  weekday_value smallint;
  seen_weekdays smallint[];

  inserted_item_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = '28000';
  end if;

  select
    family_members.id,
    family_members.family_id,
    family_members.role
  into
    owner_member_id,
    owner_family_id,
    owner_role
  from public.family_members
  where family_members.user_id = current_user_id;

  if owner_member_id is null then
    raise exception 'not_family_member'
      using errcode = 'P0001';
  end if;

  if owner_role <> 'owner' then
    raise exception 'not_family_owner'
      using errcode = '42501';
  end if;

  select families.sharing_started_at
  into locked_sharing_started_at
  from public.families
  where families.id = owner_family_id
  for update;

  if not found then
    raise exception 'family_not_found'
      using errcode = 'P0001';
  end if;

  if locked_sharing_started_at is not null then
    raise exception 'sharing_already_started'
      using errcode = '23505';
  end if;

  if pg_catalog.jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid_payload'
      using errcode = '22023';
  end if;

  for object_key in
    select key
    from pg_catalog.jsonb_object_keys(payload) as keys(key)
  loop
    if not object_key = any(allowed_top_keys) then
      raise exception 'invalid_payload_unexpected_key:%', object_key
        using errcode = '22023';
    end if;
  end loop;

  child_payload := payload -> 'child';
  items_payload := payload -> 'items';

  if pg_catalog.jsonb_typeof(child_payload) <> 'object' then
    raise exception 'invalid_child'
      using errcode = '22023';
  end if;

  for object_key in
    select key
    from pg_catalog.jsonb_object_keys(child_payload) as keys(key)
  loop
    if not object_key = any(allowed_child_keys) then
      raise exception 'invalid_child_unexpected_key:%', object_key
        using errcode = '22023';
    end if;
  end loop;

  if pg_catalog.jsonb_typeof(child_payload -> 'name') <> 'string' then
    raise exception 'invalid_child_name'
      using errcode = '22023';
  end if;

  child_name := pg_catalog.btrim(child_payload ->> 'name');

  if pg_catalog.char_length(child_name) < 1
    or pg_catalog.char_length(child_name) > 8
  then
    raise exception 'invalid_child_name'
      using errcode = '22023';
  end if;

  if child_payload ? 'iconType'
    and pg_catalog.jsonb_typeof(child_payload -> 'iconType') <> 'null'
  then
    if pg_catalog.jsonb_typeof(child_payload -> 'iconType') <> 'string' then
      raise exception 'invalid_child_icon_type'
        using errcode = '22023';
    end if;

    child_icon_type := child_payload ->> 'iconType';

    if child_icon_type not in ('default', 'image') then
      raise exception 'invalid_child_icon_type'
        using errcode = '22023';
    end if;
  else
    child_icon_type := 'default';
  end if;

  if child_payload ? 'iconId'
    and pg_catalog.jsonb_typeof(child_payload -> 'iconId') <> 'null'
  then
    if pg_catalog.jsonb_typeof(child_payload -> 'iconId') <> 'string' then
      raise exception 'invalid_child_icon_id'
        using errcode = '22023';
    end if;

    child_icon_id := child_payload ->> 'iconId';

    if child_icon_id <> 'default-baby' then
      raise exception 'invalid_child_icon_id'
        using errcode = '22023';
    end if;
  else
    child_icon_id := 'default-baby';
  end if;

  if child_payload ? 'iconUrl'
    and pg_catalog.jsonb_typeof(child_payload -> 'iconUrl') <> 'null'
  then
    if pg_catalog.jsonb_typeof(child_payload -> 'iconUrl') <> 'string' then
      raise exception 'invalid_child_icon_url'
        using errcode = '22023';
    end if;

    child_icon_url := pg_catalog.nullif(pg_catalog.btrim(child_payload ->> 'iconUrl'), '');

    if child_icon_url is not null
      and pg_catalog.char_length(child_icon_url) > 2048
    then
      raise exception 'invalid_child_icon_url'
        using errcode = '22023';
    end if;
  else
    child_icon_url := null;
  end if;

  if child_icon_type = 'image' and child_icon_url is null then
    raise exception 'invalid_child_icon_image_url'
      using errcode = '22023';
  end if;

  if child_icon_type = 'default' and child_icon_url is not null then
    raise exception 'invalid_child_icon_default_url'
      using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(items_payload) <> 'array' then
    raise exception 'invalid_items'
      using errcode = '22023';
  end if;

  item_count := pg_catalog.jsonb_array_length(items_payload);

  if item_count > 200 then
    raise exception 'invalid_items_count'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.children
    where children.family_id = owner_family_id
  ) or exists (
    select 1
    from public.item_templates
    where item_templates.family_id = owner_family_id
  ) then
    raise exception 'family_data_already_exists'
      using errcode = '23505';
  end if;

  insert into public.children (
    family_id,
    name,
    sort_order,
    icon_type,
    icon_id,
    icon_url
  )
  values (
    owner_family_id,
    child_name,
    0,
    child_icon_type,
    child_icon_id,
    child_icon_url
  )
  returning id into new_child_id;

  for item_payload, item_ordinal in
    select value, ordinality
    from pg_catalog.jsonb_array_elements(items_payload) with ordinality as item_rows(value, ordinality)
  loop
    if pg_catalog.jsonb_typeof(item_payload) <> 'object' then
      raise exception 'invalid_item'
        using errcode = '22023';
    end if;

    for object_key in
      select key
      from pg_catalog.jsonb_object_keys(item_payload) as keys(key)
    loop
      if not object_key = any(allowed_item_keys) then
        raise exception 'invalid_item_unexpected_key:%', object_key
          using errcode = '22023';
      end if;
    end loop;

    if pg_catalog.jsonb_typeof(item_payload -> 'localId') <> 'string' then
      raise exception 'invalid_item_local_id'
        using errcode = '22023';
    end if;

    item_local_id := pg_catalog.btrim(item_payload ->> 'localId');

    if pg_catalog.char_length(item_local_id) < 1
      or pg_catalog.char_length(item_local_id) > 128
    then
      raise exception 'invalid_item_local_id'
        using errcode = '22023';
    end if;

    if item_local_id = any(local_ids) then
      raise exception 'duplicate_item_local_id'
        using errcode = '23505';
    end if;

    local_ids := pg_catalog.array_append(local_ids, item_local_id);

    if pg_catalog.jsonb_typeof(item_payload -> 'name') <> 'string' then
      raise exception 'invalid_item_name'
        using errcode = '22023';
    end if;

    item_name := pg_catalog.btrim(item_payload ->> 'name');

    if pg_catalog.char_length(item_name) < 1
      or pg_catalog.char_length(item_name) > 80
    then
      raise exception 'invalid_item_name'
        using errcode = '22023';
    end if;

    if pg_catalog.jsonb_typeof(item_payload -> 'category') <> 'string' then
      raise exception 'invalid_item_category'
        using errcode = '22023';
    end if;

    item_category := item_payload ->> 'category';

    item_kind := case item_category
      when '持ち物' then 'regular'
      when 'スポット追加' then 'spot'
      when 'ざっくり管理' then 'rough'
      else null
    end;

    if item_kind is null then
      raise exception 'invalid_item_category'
        using errcode = '22023';
    end if;

    if pg_catalog.jsonb_typeof(item_payload -> 'count') <> 'number' then
      raise exception 'invalid_item_count'
        using errcode = '22023';
    end if;

    item_count_numeric := (item_payload ->> 'count')::numeric;

    if item_count_numeric <> pg_catalog.trunc(item_count_numeric) then
      raise exception 'invalid_item_count'
        using errcode = '22023';
    end if;

    item_default_quantity := item_count_numeric::integer;

    if item_kind = 'spot' then
      if item_default_quantity < 1 or item_default_quantity > 99 then
        raise exception 'invalid_item_count'
          using errcode = '22023';
      end if;
    else
      if item_default_quantity < 0 or item_default_quantity > 999 then
        raise exception 'invalid_item_count'
          using errcode = '22023';
      end if;
    end if;

    if pg_catalog.jsonb_typeof(item_payload -> 'unit') <> 'string' then
      raise exception 'invalid_item_unit'
        using errcode = '22023';
    end if;

    item_unit := item_payload ->> 'unit';

    if pg_catalog.char_length(item_unit) > 16 then
      raise exception 'invalid_item_unit'
        using errcode = '22023';
    end if;

    if pg_catalog.jsonb_typeof(item_payload -> 'sortOrder') <> 'number' then
      raise exception 'invalid_item_sort_order'
        using errcode = '22023';
    end if;

    item_sort_order_numeric := (item_payload ->> 'sortOrder')::numeric;

    if item_sort_order_numeric <> pg_catalog.trunc(item_sort_order_numeric) then
      raise exception 'invalid_item_sort_order'
        using errcode = '22023';
    end if;

    item_sort_order := item_sort_order_numeric::integer;

    if item_sort_order < 0 or item_sort_order > 100000 then
      raise exception 'invalid_item_sort_order'
        using errcode = '22023';
    end if;

    weekdays_payload := item_payload -> 'weekdays';

    if pg_catalog.jsonb_typeof(weekdays_payload) <> 'array' then
      raise exception 'invalid_item_weekdays'
        using errcode = '22023';
    end if;

    if item_kind <> 'spot'
      and pg_catalog.jsonb_array_length(weekdays_payload) > 0
    then
      raise exception 'invalid_item_weekdays'
        using errcode = '22023';
    end if;

    if item_kind = 'spot'
      and pg_catalog.jsonb_array_length(weekdays_payload) > 2
    then
      raise exception 'invalid_item_weekdays'
        using errcode = '22023';
    end if;

    seen_weekdays := array[]::smallint[];

    for weekday_payload in
      select value
      from pg_catalog.jsonb_array_elements(weekdays_payload) as weekday_rows(value)
    loop
      if pg_catalog.jsonb_typeof(weekday_payload) <> 'number' then
        raise exception 'invalid_item_weekday'
          using errcode = '22023';
      end if;

      weekday_numeric := (weekday_payload #>> '{}')::numeric;

      if weekday_numeric <> pg_catalog.trunc(weekday_numeric)
        or weekday_numeric < 0
        or weekday_numeric > 6
      then
        raise exception 'invalid_item_weekday'
          using errcode = '22023';
      end if;

      weekday_value := weekday_numeric::smallint;

      if weekday_value = any(seen_weekdays) then
        raise exception 'duplicate_item_weekday'
          using errcode = '23505';
      end if;

      seen_weekdays := pg_catalog.array_append(seen_weekdays, weekday_value);
    end loop;

    if item_payload ? 'roughState'
      and pg_catalog.jsonb_typeof(item_payload -> 'roughState') <> 'null'
    then
      if pg_catalog.jsonb_typeof(item_payload -> 'roughState') <> 'string' then
        raise exception 'invalid_item_rough_state'
          using errcode = '22023';
      end if;

      item_rough_state := item_payload ->> 'roughState';
    else
      item_rough_state := null;
    end if;

    if item_kind <> 'rough' and item_rough_state is not null then
      raise exception 'invalid_item_rough_state'
        using errcode = '22023';
    end if;

    if item_kind = 'rough' then
      item_current_rough_state := case item_rough_state
        when '十分' then 'enough'
        when '少ない' then 'low'
        when '補充' then 'refill'
        else null
      end;

      if item_current_rough_state is null then
        raise exception 'invalid_item_rough_state'
          using errcode = '22023';
      end if;
    else
      item_current_rough_state := null;
    end if;

    insert into public.item_templates (
      family_id,
      child_id,
      kind,
      name,
      default_quantity,
      unit,
      weekday,
      sort_order,
      is_active,
      current_rough_state
    )
    values (
      owner_family_id,
      new_child_id,
      item_kind,
      item_name,
      item_default_quantity,
      item_unit,
      null,
      item_sort_order,
      true,
      item_current_rough_state
    )
    returning id into new_item_template_id;

    foreach weekday_value in array seen_weekdays
    loop
      insert into public.item_template_weekdays (
        item_template_id,
        family_id,
        weekday
      )
      values (
        new_item_template_id,
        owner_family_id,
        weekday_value
      );
    end loop;

    inserted_item_count := inserted_item_count + 1;
  end loop;

  started_at := pg_catalog.now();

  update public.families
  set
    sharing_started_at = started_at,
    sharing_started_by_member_id = owner_member_id
  where families.id = owner_family_id
    and families.sharing_started_at is null;

  if not found then
    raise exception 'sharing_already_started'
      using errcode = '23505';
  end if;

  family_id := owner_family_id;
  child_id := new_child_id;
  item_template_count := inserted_item_count;
  sharing_started_at := started_at;

  return next;
end;
$$;

revoke all on function public.start_family_data_sharing(jsonb) from public;
revoke all on function public.start_family_data_sharing(jsonb) from anon;
revoke all on function public.start_family_data_sharing(jsonb) from authenticated;

grant execute on function public.start_family_data_sharing(jsonb)
  to authenticated;
