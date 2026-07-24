create or replace function public.process_daily_carryovers(
  p_family_id uuid,
  p_child_id uuid,
  p_to_session_date date
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_member_id uuid;
  target_child_id uuid;
  destination_session_id uuid;
  created_count integer := 0;
  updated_count integer := 0;
  updated_regular_count integer := 0;
  updated_spot_count integer := 0;
  updated_rough_count integer := 0;
  processed_count integer := 0;
  skipped_count integer := 0;
  run_at timestamptz := pg_catalog.now();
begin
  if current_user_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'created_count', 0,
      'updated_count', 0,
      'processed_count', 0,
      'skipped_count', 0
    );
  end if;

  if p_family_id is null
    or p_child_id is null
    or p_to_session_date is null
  then
    return pg_catalog.jsonb_build_object(
      'status', 'invalid_state',
      'created_count', 0,
      'updated_count', 0,
      'processed_count', 0,
      'skipped_count', 0
    );
  end if;

  if not public.is_family_member(p_family_id) then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'created_count', 0,
      'updated_count', 0,
      'processed_count', 0,
      'skipped_count', 0
    );
  end if;

  select family_members.id
  into current_member_id
  from public.family_members
  where family_members.family_id = p_family_id
    and family_members.user_id = current_user_id;

  if current_member_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'created_count', 0,
      'updated_count', 0,
      'processed_count', 0,
      'skipped_count', 0
    );
  end if;

  select children.id
  into target_child_id
  from public.children
  where children.id = p_child_id
    and children.family_id = p_family_id;

  if target_child_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'forbidden',
      'created_count', 0,
      'updated_count', 0,
      'processed_count', 0,
      'skipped_count', 0
    );
  end if;

  select daily_sessions.id
  into destination_session_id
  from public.daily_sessions
  where daily_sessions.family_id = p_family_id
    and daily_sessions.child_id = p_child_id
    and daily_sessions.session_date = p_to_session_date;

  if destination_session_id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'created_count', 0,
      'updated_count', 0,
      'processed_count', 0,
      'skipped_count', 0
    );
  end if;

  drop table if exists pg_temp.claimed_daily_carryovers;
  drop table if exists pg_temp.processable_daily_carryover_sources;
  drop table if exists pg_temp.inserted_ad_hoc_daily_carryovers;
  drop table if exists pg_temp.successful_regular_carryover_groups;
  drop table if exists pg_temp.successful_spot_carryover_groups;
  drop table if exists pg_temp.successful_rough_carryover_groups;

  create temporary table pg_temp.claimed_daily_carryovers (
    id uuid primary key,
    family_id uuid not null,
    daily_session_id uuid not null,
    source_session_date date not null,
    item_template_id uuid,
    kind text not null,
    name text not null,
    quantity integer not null,
    unit text,
    sort_order integer not null,
    is_ad_hoc boolean not null,
    due_date date,
    shortage_count integer,
    carryover_pending_shortage_count integer
  ) on commit drop;

  create temporary table pg_temp.processable_daily_carryover_sources (
    source_id uuid primary key,
    reason text not null
  ) on commit drop;

  create temporary table pg_temp.inserted_ad_hoc_daily_carryovers (
    source_id uuid primary key
  ) on commit drop;

  create temporary table pg_temp.successful_regular_carryover_groups (
    item_template_id uuid primary key
  ) on commit drop;

  create temporary table pg_temp.successful_spot_carryover_groups (
    item_template_id uuid primary key
  ) on commit drop;

  create temporary table pg_temp.successful_rough_carryover_groups (
    item_template_id uuid primary key
  ) on commit drop;

  insert into pg_temp.claimed_daily_carryovers (
    id,
    family_id,
    daily_session_id,
    source_session_date,
    item_template_id,
    kind,
    name,
    quantity,
    unit,
    sort_order,
    is_ad_hoc,
    due_date,
    shortage_count,
    carryover_pending_shortage_count
  )
  select
    source_items.id,
    source_items.family_id,
    source_items.daily_session_id,
    source_sessions.session_date,
    source_items.item_template_id,
    source_items.kind,
    source_items.name,
    source_items.quantity,
    source_items.unit,
    source_items.sort_order,
    source_items.is_ad_hoc,
    source_items.due_date,
    source_items.shortage_count,
    source_items.carryover_pending_shortage_count
  from public.daily_items as source_items
  join public.daily_sessions as source_sessions
    on source_sessions.id = source_items.daily_session_id
    and source_sessions.family_id = source_items.family_id
  where source_sessions.family_id = p_family_id
    and source_sessions.child_id = p_child_id
    and source_sessions.session_date < p_to_session_date
    and source_items.deleted_at is null
    and source_items.is_deferred = true
    and source_items.is_prepared = false
    and source_items.carryover_processed_at is null
    and source_items.carryover_resolved_at is null
  order by source_sessions.session_date, source_items.id
  for update of source_items skip locked;

  if exists (
    select 1
    from pg_temp.claimed_daily_carryovers as claimed
    where not (
      (
        claimed.item_template_id is not null
        and claimed.is_ad_hoc = false
        and claimed.kind in ('regular', 'spot', 'rough')
      )
      or (
        claimed.item_template_id is null
        and claimed.is_ad_hoc = true
        and claimed.kind = 'spot'
      )
    )
  ) then
    raise exception 'invalid_carryover_source_shape'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from pg_temp.claimed_daily_carryovers as claimed
    where claimed.item_template_id is not null
    group by claimed.item_template_id
    having pg_catalog.count(distinct claimed.kind) > 1
  ) then
    raise exception 'mixed_template_carryover_kinds'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from pg_temp.claimed_daily_carryovers as claimed
    where claimed.item_template_id is not null
      and claimed.kind = 'regular'
      and greatest(
        coalesce(claimed.shortage_count, 0),
        coalesce(claimed.carryover_pending_shortage_count, 0)
      ) <= 0
  ) then
    raise exception 'invalid_regular_carryover_pending'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from (
      select
        claimed.item_template_id,
        claimed.kind
      from pg_temp.claimed_daily_carryovers as claimed
      where claimed.item_template_id is not null
      group by claimed.item_template_id, claimed.kind
    ) as template_groups
    where not exists (
      select 1
      from public.daily_items as destination_items
      where destination_items.family_id = p_family_id
        and destination_items.daily_session_id = destination_session_id
        and destination_items.item_template_id = template_groups.item_template_id
        and destination_items.kind = template_groups.kind
        and destination_items.deleted_at is null
    )
  ) then
    raise exception 'missing_destination_carryover_item'
      using errcode = '23503';
  end if;

  with regular_groups as (
    select
      claimed.item_template_id,
      pg_catalog.max(
        greatest(
          coalesce(claimed.shortage_count, 0),
          coalesce(claimed.carryover_pending_shortage_count, 0)
        )
      ) as source_pending,
      (
        array_agg(
          claimed.id
          order by claimed.source_session_date desc, claimed.id desc
        )
      )[1] as carried_from_daily_item_id
    from pg_temp.claimed_daily_carryovers as claimed
    where claimed.item_template_id is not null
      and claimed.kind = 'regular'
    group by claimed.item_template_id
  ),
  updated_regular as (
    update public.daily_items as destination_items
    set
      carryover_pending_shortage_count = greatest(
        coalesce(destination_items.carryover_pending_shortage_count, 0),
        regular_groups.source_pending
      ),
      is_carryover = true,
      carried_from_daily_item_id = regular_groups.carried_from_daily_item_id,
      version = destination_items.version + 1
    from regular_groups
    where destination_items.family_id = p_family_id
      and destination_items.daily_session_id = destination_session_id
      and destination_items.item_template_id = regular_groups.item_template_id
      and destination_items.kind = 'regular'
      and destination_items.deleted_at is null
      and (
        destination_items.carryover_pending_shortage_count is distinct from
          greatest(
            coalesce(destination_items.carryover_pending_shortage_count, 0),
            regular_groups.source_pending
          )
        or destination_items.is_carryover is distinct from true
        or destination_items.carried_from_daily_item_id is distinct from
          regular_groups.carried_from_daily_item_id
      )
    returning destination_items.item_template_id
  )
  insert into pg_temp.successful_regular_carryover_groups (
    item_template_id
  )
  select updated_regular.item_template_id
  from updated_regular
  on conflict (item_template_id) do nothing;

  select pg_catalog.count(*)::integer
  into updated_regular_count
  from pg_temp.successful_regular_carryover_groups;

  with regular_groups as (
    select
      claimed.item_template_id,
      pg_catalog.max(
        greatest(
          coalesce(claimed.shortage_count, 0),
          coalesce(claimed.carryover_pending_shortage_count, 0)
        )
      ) as source_pending,
      (
        array_agg(
          claimed.id
          order by claimed.source_session_date desc, claimed.id desc
        )
      )[1] as carried_from_daily_item_id
    from pg_temp.claimed_daily_carryovers as claimed
    where claimed.item_template_id is not null
      and claimed.kind = 'regular'
    group by claimed.item_template_id
  ),
  already_satisfied_regular as (
    select regular_groups.item_template_id
    from regular_groups
    join public.daily_items as destination_items
      on destination_items.family_id = p_family_id
      and destination_items.daily_session_id = destination_session_id
      and destination_items.item_template_id = regular_groups.item_template_id
      and destination_items.kind = 'regular'
      and destination_items.deleted_at is null
    where not exists (
        select 1
        from pg_temp.successful_regular_carryover_groups as successful_groups
        where successful_groups.item_template_id = regular_groups.item_template_id
      )
      and destination_items.is_carryover is not distinct from true
      and destination_items.carried_from_daily_item_id is not distinct from
        regular_groups.carried_from_daily_item_id
      and destination_items.carryover_pending_shortage_count is not distinct from
        greatest(
          coalesce(destination_items.carryover_pending_shortage_count, 0),
          regular_groups.source_pending
        )
  )
  insert into pg_temp.successful_regular_carryover_groups (
    item_template_id
  )
  select already_satisfied_regular.item_template_id
  from already_satisfied_regular
  on conflict (item_template_id) do nothing;

  if exists (
    select 1
    from (
      select claimed.item_template_id
      from pg_temp.claimed_daily_carryovers as claimed
      where claimed.item_template_id is not null
        and claimed.kind = 'regular'
      group by claimed.item_template_id
    ) as regular_groups
    where not exists (
      select 1
      from pg_temp.successful_regular_carryover_groups as successful_groups
      where successful_groups.item_template_id = regular_groups.item_template_id
    )
  ) then
    raise exception 'unsatisfied_regular_carryover_destination'
      using errcode = '23514';
  end if;

  insert into pg_temp.processable_daily_carryover_sources (
    source_id,
    reason
  )
  select
    claimed.id,
    'regular_template'
  from pg_temp.claimed_daily_carryovers as claimed
  join pg_temp.successful_regular_carryover_groups as successful_groups
    on successful_groups.item_template_id = claimed.item_template_id
  where claimed.kind = 'regular'
  on conflict (source_id) do nothing;

  with spot_groups as (
    select
      claimed.item_template_id,
      pg_catalog.min(claimed.due_date) filter (
        where claimed.due_date is not null
      ) as earliest_source_due_date,
      (
        array_agg(
          claimed.id
          order by claimed.source_session_date desc, claimed.id desc
        )
      )[1] as carried_from_daily_item_id
    from pg_temp.claimed_daily_carryovers as claimed
    where claimed.item_template_id is not null
      and claimed.kind = 'spot'
    group by claimed.item_template_id
  ),
  updated_spot as (
    update public.daily_items as destination_items
    set
      is_carryover = true,
      carried_from_daily_item_id = spot_groups.carried_from_daily_item_id,
      due_date = (
        select pg_catalog.min(due_values.due_date)
        from (
          values
            (destination_items.due_date),
            (spot_groups.earliest_source_due_date)
        ) as due_values(due_date)
        where due_values.due_date is not null
      ),
      version = destination_items.version + 1
    from spot_groups
    where destination_items.family_id = p_family_id
      and destination_items.daily_session_id = destination_session_id
      and destination_items.item_template_id = spot_groups.item_template_id
      and destination_items.kind = 'spot'
      and destination_items.deleted_at is null
      and (
        destination_items.is_carryover is distinct from true
        or destination_items.carried_from_daily_item_id is distinct from
          spot_groups.carried_from_daily_item_id
        or destination_items.due_date is distinct from (
          select pg_catalog.min(due_values.due_date)
          from (
            values
              (destination_items.due_date),
              (spot_groups.earliest_source_due_date)
          ) as due_values(due_date)
          where due_values.due_date is not null
        )
      )
    returning destination_items.item_template_id
  )
  insert into pg_temp.successful_spot_carryover_groups (
    item_template_id
  )
  select updated_spot.item_template_id
  from updated_spot
  on conflict (item_template_id) do nothing;

  select pg_catalog.count(*)::integer
  into updated_spot_count
  from pg_temp.successful_spot_carryover_groups;

  with spot_groups as (
    select
      claimed.item_template_id,
      pg_catalog.min(claimed.due_date) filter (
        where claimed.due_date is not null
      ) as earliest_source_due_date,
      (
        array_agg(
          claimed.id
          order by claimed.source_session_date desc, claimed.id desc
        )
      )[1] as carried_from_daily_item_id
    from pg_temp.claimed_daily_carryovers as claimed
    where claimed.item_template_id is not null
      and claimed.kind = 'spot'
    group by claimed.item_template_id
  ),
  already_satisfied_spot as (
    select spot_groups.item_template_id
    from spot_groups
    join public.daily_items as destination_items
      on destination_items.family_id = p_family_id
      and destination_items.daily_session_id = destination_session_id
      and destination_items.item_template_id = spot_groups.item_template_id
      and destination_items.kind = 'spot'
      and destination_items.deleted_at is null
    where not exists (
        select 1
        from pg_temp.successful_spot_carryover_groups as successful_groups
        where successful_groups.item_template_id = spot_groups.item_template_id
      )
      and destination_items.is_carryover is not distinct from true
      and destination_items.carried_from_daily_item_id is not distinct from
        spot_groups.carried_from_daily_item_id
      and destination_items.due_date is not distinct from (
        select pg_catalog.min(due_values.due_date)
        from (
          values
            (destination_items.due_date),
            (spot_groups.earliest_source_due_date)
        ) as due_values(due_date)
        where due_values.due_date is not null
      )
  )
  insert into pg_temp.successful_spot_carryover_groups (
    item_template_id
  )
  select already_satisfied_spot.item_template_id
  from already_satisfied_spot
  on conflict (item_template_id) do nothing;

  if exists (
    select 1
    from (
      select claimed.item_template_id
      from pg_temp.claimed_daily_carryovers as claimed
      where claimed.item_template_id is not null
        and claimed.kind = 'spot'
      group by claimed.item_template_id
    ) as spot_groups
    where not exists (
      select 1
      from pg_temp.successful_spot_carryover_groups as successful_groups
      where successful_groups.item_template_id = spot_groups.item_template_id
    )
  ) then
    raise exception 'unsatisfied_spot_carryover_destination'
      using errcode = '23514';
  end if;

  insert into pg_temp.processable_daily_carryover_sources (
    source_id,
    reason
  )
  select
    claimed.id,
    'spot_template'
  from pg_temp.claimed_daily_carryovers as claimed
  join pg_temp.successful_spot_carryover_groups as successful_groups
    on successful_groups.item_template_id = claimed.item_template_id
  where claimed.kind = 'spot'
  on conflict (source_id) do nothing;

  with rough_groups as (
    select
      claimed.item_template_id,
      (
        array_agg(
          claimed.id
          order by claimed.source_session_date desc, claimed.id desc
        )
      )[1] as carried_from_daily_item_id
    from pg_temp.claimed_daily_carryovers as claimed
    where claimed.item_template_id is not null
      and claimed.kind = 'rough'
    group by claimed.item_template_id
  ),
  updated_rough as (
    update public.daily_items as destination_items
    set
      is_carryover = true,
      carried_from_daily_item_id = rough_groups.carried_from_daily_item_id,
      version = destination_items.version + 1
    from rough_groups
    where destination_items.family_id = p_family_id
      and destination_items.daily_session_id = destination_session_id
      and destination_items.item_template_id = rough_groups.item_template_id
      and destination_items.kind = 'rough'
      and destination_items.deleted_at is null
      and (
        destination_items.is_carryover is distinct from true
        or destination_items.carried_from_daily_item_id is distinct from
          rough_groups.carried_from_daily_item_id
      )
    returning destination_items.item_template_id
  )
  insert into pg_temp.successful_rough_carryover_groups (
    item_template_id
  )
  select updated_rough.item_template_id
  from updated_rough
  on conflict (item_template_id) do nothing;

  select pg_catalog.count(*)::integer
  into updated_rough_count
  from pg_temp.successful_rough_carryover_groups;

  with rough_groups as (
    select
      claimed.item_template_id,
      (
        array_agg(
          claimed.id
          order by claimed.source_session_date desc, claimed.id desc
        )
      )[1] as carried_from_daily_item_id
    from pg_temp.claimed_daily_carryovers as claimed
    where claimed.item_template_id is not null
      and claimed.kind = 'rough'
    group by claimed.item_template_id
  ),
  already_satisfied_rough as (
    select rough_groups.item_template_id
    from rough_groups
    join public.daily_items as destination_items
      on destination_items.family_id = p_family_id
      and destination_items.daily_session_id = destination_session_id
      and destination_items.item_template_id = rough_groups.item_template_id
      and destination_items.kind = 'rough'
      and destination_items.deleted_at is null
    where not exists (
        select 1
        from pg_temp.successful_rough_carryover_groups as successful_groups
        where successful_groups.item_template_id = rough_groups.item_template_id
      )
      and destination_items.is_carryover is not distinct from true
      and destination_items.carried_from_daily_item_id is not distinct from
        rough_groups.carried_from_daily_item_id
  )
  insert into pg_temp.successful_rough_carryover_groups (
    item_template_id
  )
  select already_satisfied_rough.item_template_id
  from already_satisfied_rough
  on conflict (item_template_id) do nothing;

  if exists (
    select 1
    from (
      select claimed.item_template_id
      from pg_temp.claimed_daily_carryovers as claimed
      where claimed.item_template_id is not null
        and claimed.kind = 'rough'
      group by claimed.item_template_id
    ) as rough_groups
    where not exists (
      select 1
      from pg_temp.successful_rough_carryover_groups as successful_groups
      where successful_groups.item_template_id = rough_groups.item_template_id
    )
  ) then
    raise exception 'unsatisfied_rough_carryover_destination'
      using errcode = '23514';
  end if;

  insert into pg_temp.processable_daily_carryover_sources (
    source_id,
    reason
  )
  select
    claimed.id,
    'rough_template'
  from pg_temp.claimed_daily_carryovers as claimed
  join pg_temp.successful_rough_carryover_groups as successful_groups
    on successful_groups.item_template_id = claimed.item_template_id
  where claimed.kind = 'rough'
  on conflict (source_id) do nothing;

  updated_count :=
    updated_regular_count + updated_spot_count + updated_rough_count;

  with inserted_ad_hoc as (
    insert into public.daily_items (
      id,
      family_id,
      daily_session_id,
      item_template_id,
      kind,
      name,
      quantity,
      unit,
      sort_order,
      is_checked,
      is_prepared,
      is_deferred,
      due_date,
      is_ad_hoc,
      rough_state,
      required_quantity,
      observed_quantity,
      shortage_count,
      carryover_pending_shortage_count,
      is_carryover,
      carried_from_daily_item_id,
      carryover_processed_at,
      carryover_resolved_at,
      deleted_at,
      updated_by_member_id,
      updated_by_user_id,
      updated_by_display_name,
      version
    )
    select
      extensions.gen_random_uuid(),
      claimed.family_id,
      destination_session_id,
      null,
      'spot',
      claimed.name,
      claimed.quantity,
      claimed.unit,
      claimed.sort_order,
      false,
      false,
      false,
      claimed.due_date,
      true,
      null,
      claimed.quantity,
      null,
      null,
      null,
      true,
      claimed.id,
      null,
      null,
      null,
      null,
      null,
      null,
      1
    from pg_temp.claimed_daily_carryovers as claimed
    where claimed.kind = 'spot'
      and claimed.item_template_id is null
      and claimed.is_ad_hoc = true
    on conflict (daily_session_id, carried_from_daily_item_id)
      where is_ad_hoc = true
        and carried_from_daily_item_id is not null
        and deleted_at is null
      do nothing
    returning daily_items.carried_from_daily_item_id as source_id
  )
  insert into pg_temp.inserted_ad_hoc_daily_carryovers (
    source_id
  )
  select inserted_ad_hoc.source_id
  from inserted_ad_hoc;

  select pg_catalog.count(*)::integer
  into created_count
  from pg_temp.inserted_ad_hoc_daily_carryovers;

  if exists (
    select 1
    from pg_temp.claimed_daily_carryovers as claimed
    where claimed.kind = 'spot'
      and claimed.item_template_id is null
      and claimed.is_ad_hoc = true
      and not exists (
        select 1
        from pg_temp.inserted_ad_hoc_daily_carryovers as inserted_ad_hoc
        where inserted_ad_hoc.source_id = claimed.id
      )
      and not exists (
        select 1
        from public.daily_items as destination_items
        where destination_items.daily_session_id = destination_session_id
          and destination_items.is_ad_hoc = true
          and destination_items.carried_from_daily_item_id = claimed.id
          and destination_items.deleted_at is null
      )
  ) then
    raise exception 'missing_existing_ad_hoc_carryover_item'
      using errcode = '23503';
  end if;

  insert into pg_temp.processable_daily_carryover_sources (
    source_id,
    reason
  )
  select
    inserted_ad_hoc.source_id,
    'ad_hoc_inserted'
  from pg_temp.inserted_ad_hoc_daily_carryovers as inserted_ad_hoc
  on conflict (source_id) do nothing;

  insert into pg_temp.processable_daily_carryover_sources (
    source_id,
    reason
  )
  select
    claimed.id,
    'ad_hoc_existing'
  from pg_temp.claimed_daily_carryovers as claimed
  where claimed.kind = 'spot'
    and claimed.item_template_id is null
    and claimed.is_ad_hoc = true
    and not exists (
      select 1
      from pg_temp.inserted_ad_hoc_daily_carryovers as inserted_ad_hoc
      where inserted_ad_hoc.source_id = claimed.id
    )
    and exists (
      select 1
      from public.daily_items as destination_items
      where destination_items.daily_session_id = destination_session_id
        and destination_items.is_ad_hoc = true
        and destination_items.carried_from_daily_item_id = claimed.id
        and destination_items.deleted_at is null
    )
  on conflict (source_id) do nothing;

  select pg_catalog.count(*)::integer
  into skipped_count
  from pg_temp.processable_daily_carryover_sources as processable_sources
  where processable_sources.reason = 'ad_hoc_existing';

  if exists (
    select 1
    from pg_temp.claimed_daily_carryovers as claimed
    where not exists (
      select 1
      from pg_temp.processable_daily_carryover_sources as processable_sources
      where processable_sources.source_id = claimed.id
    )
  ) then
    raise exception 'unprocessed_claimed_carryover_source'
      using errcode = '23514';
  end if;

  with processed_sources as (
    update public.daily_items as source_items
    set
      carryover_processed_at = run_at,
      version = source_items.version + 1
    where source_items.id in (
      select processable_sources.source_id
      from pg_temp.processable_daily_carryover_sources as processable_sources
    )
      and source_items.family_id = p_family_id
      and source_items.carryover_processed_at is null
      and source_items.carryover_resolved_at is null
    returning source_items.id
  )
  select pg_catalog.count(*)::integer
  into processed_count
  from processed_sources;

  return pg_catalog.jsonb_build_object(
    'status', 'success',
    'created_count', created_count,
    'updated_count', updated_count,
    'processed_count', processed_count,
    'skipped_count', skipped_count
  );
end;
$$;

comment on function public.process_daily_carryovers(uuid, uuid, date) is
  'Processes deferred carryover daily items into an existing destination session for one family child and date.';

revoke all on function public.process_daily_carryovers(uuid, uuid, date)
  from public;
revoke all on function public.process_daily_carryovers(uuid, uuid, date)
  from anon;
revoke all on function public.process_daily_carryovers(uuid, uuid, date)
  from authenticated;

grant execute on function public.process_daily_carryovers(uuid, uuid, date)
  to authenticated;

