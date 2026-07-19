begin;

alter table public.daily_sessions
  add column if not exists checked_by_user_id uuid,
  add column if not exists checked_by_display_name text,
  add column if not exists prepared_by_user_id uuid,
  add column if not exists prepared_by_display_name text,
  add column if not exists thanks_sent_at timestamptz,
  add column if not exists thanks_sent_by_member_id uuid,
  add column if not exists thanks_sent_by_user_id uuid,
  add column if not exists thanks_sent_by_display_name text,
  add column if not exists thanks_received_by_member_id uuid,
  add column if not exists thanks_received_by_user_id uuid,
  add column if not exists thanks_received_by_display_name text,
  add column if not exists version integer;

update public.daily_sessions
set version = 1
where version is null;

alter table public.daily_sessions
  alter column version set default 1,
  alter column version set not null;

alter table public.daily_items
  add column if not exists required_quantity integer,
  add column if not exists observed_quantity integer,
  add column if not exists shortage_count integer,
  add column if not exists carryover_pending_shortage_count integer,
  add column if not exists is_carryover boolean,
  add column if not exists carried_from_daily_item_id uuid,
  add column if not exists carryover_processed_at timestamptz,
  add column if not exists carryover_resolved_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_by_member_id uuid,
  add column if not exists updated_by_user_id uuid,
  add column if not exists updated_by_display_name text,
  add column if not exists version integer;

update public.daily_items
set
  required_quantity = coalesce(required_quantity, quantity),
  is_carryover = coalesce(is_carryover, false),
  version = coalesce(version, 1)
where required_quantity is null
  or is_carryover is null
  or version is null;

alter table public.daily_items
  alter column required_quantity set default 1,
  alter column required_quantity set not null,
  alter column is_carryover set default false,
  alter column is_carryover set not null,
  alter column version set default 1,
  alter column version set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_sessions'::regclass
      and conname = 'daily_sessions_checked_member_family_fk'
  ) then
    alter table public.daily_sessions
      drop constraint daily_sessions_checked_member_family_fk;
  end if;

  alter table public.daily_sessions
    add constraint daily_sessions_checked_member_family_fk
    foreign key (checked_by_member_id, family_id)
    references public.family_members(id, family_id)
    on delete set null;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_sessions'::regclass
      and conname = 'daily_sessions_prepared_member_family_fk'
  ) then
    alter table public.daily_sessions
      drop constraint daily_sessions_prepared_member_family_fk;
  end if;

  alter table public.daily_sessions
    add constraint daily_sessions_prepared_member_family_fk
    foreign key (prepared_by_member_id, family_id)
    references public.family_members(id, family_id)
    on delete set null;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_sessions'::regclass
      and conname = 'daily_sessions_thanks_sent_member_family_fk'
  ) then
    alter table public.daily_sessions
      add constraint daily_sessions_thanks_sent_member_family_fk
      foreign key (thanks_sent_by_member_id, family_id)
      references public.family_members(id, family_id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_sessions'::regclass
      and conname = 'daily_sessions_thanks_received_member_family_fk'
  ) then
    alter table public.daily_sessions
      add constraint daily_sessions_thanks_received_member_family_fk
      foreign key (thanks_received_by_member_id, family_id)
      references public.family_members(id, family_id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_items'::regclass
      and conname = 'daily_items_updated_member_family_fk'
  ) then
    alter table public.daily_items
      add constraint daily_items_updated_member_family_fk
      foreign key (updated_by_member_id, family_id)
      references public.family_members(id, family_id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_items'::regclass
      and conname = 'daily_items_carried_from_daily_item_fk'
  ) then
    alter table public.daily_items
      add constraint daily_items_carried_from_daily_item_fk
      foreign key (carried_from_daily_item_id)
      references public.daily_items(id)
      on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_sessions'::regclass
      and conname = 'daily_sessions_version_positive_check'
  ) then
    alter table public.daily_sessions
      add constraint daily_sessions_version_positive_check
      check (version >= 1)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_items'::regclass
      and conname = 'daily_items_kind_daily_sharing_check'
  ) then
    alter table public.daily_items
      add constraint daily_items_kind_daily_sharing_check
      check (kind in ('regular', 'spot', 'rough'))
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_items'::regclass
      and conname = 'daily_items_daily_sharing_counts_check'
  ) then
    alter table public.daily_items
      add constraint daily_items_daily_sharing_counts_check
      check (
        required_quantity >= 0
        and (observed_quantity is null or observed_quantity >= 0)
        and (shortage_count is null or shortage_count >= 0)
        and (
          carryover_pending_shortage_count is null
          or carryover_pending_shortage_count >= 0
        )
        and version >= 1
      )
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_items'::regclass
      and conname = 'daily_items_ad_hoc_spot_shape_check'
  ) then
    alter table public.daily_items
      add constraint daily_items_ad_hoc_spot_shape_check
      check (
        is_ad_hoc = false
        or (
          kind = 'spot'
          and item_template_id is null
        )
      )
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_items'::regclass
      and conname = 'daily_items_non_regular_observed_empty_check'
  ) then
    alter table public.daily_items
      add constraint daily_items_non_regular_observed_empty_check
      check (
        kind = 'regular'
        or (
          observed_quantity is null
          and carryover_pending_shortage_count is null
        )
      )
      not valid;
  end if;
end;
$$;

alter table public.daily_sessions
  validate constraint daily_sessions_version_positive_check;

alter table public.daily_items
  validate constraint daily_items_kind_daily_sharing_check;

alter table public.daily_items
  validate constraint daily_items_daily_sharing_counts_check;

alter table public.daily_items
  validate constraint daily_items_ad_hoc_spot_shape_check;

alter table public.daily_items
  validate constraint daily_items_non_regular_observed_empty_check;

create unique index if not exists daily_items_one_template_per_session_active_idx
  on public.daily_items(daily_session_id, item_template_id)
  where item_template_id is not null
    and deleted_at is null;

create unique index if not exists daily_items_one_ad_hoc_carryover_source_per_session_idx
  on public.daily_items(daily_session_id, carried_from_daily_item_id)
  where is_ad_hoc = true
    and carried_from_daily_item_id is not null
    and deleted_at is null;

create index if not exists daily_items_carried_from_idx
  on public.daily_items(carried_from_daily_item_id);

create index if not exists daily_items_session_kind_idx
  on public.daily_items(daily_session_id, kind);

create index if not exists daily_items_family_updated_at_idx
  on public.daily_items(family_id, updated_at);

create index if not exists daily_items_carryover_source_idx
  on public.daily_items(family_id, is_checked, is_deferred, is_carryover)
  where deleted_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.daily_sessions'::regclass
      and tgname = 'daily_sessions_set_updated_at'
  ) then
    create trigger daily_sessions_set_updated_at
      before update on public.daily_sessions
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.daily_items'::regclass
      and tgname = 'daily_items_set_updated_at'
  ) then
    create trigger daily_items_set_updated_at
      before update on public.daily_items
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

comment on column public.daily_items.required_quantity is
  'Canonical daily required quantity for shared daily data. The legacy quantity column is retained for compatibility.';
comment on column public.daily_items.observed_quantity is
  'Regular items only: the quantity actually observed in the locker.';
comment on column public.daily_items.shortage_count is
  'Regular items after confirmation: required_quantity minus observed_quantity.';
comment on column public.daily_items.carryover_pending_shortage_count is
  'Regular items before confirmation: unresolved shortage carried from a previous day.';

commit;
