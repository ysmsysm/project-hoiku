create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to authenticated;

create table public.families (
  id uuid primary key default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  display_name text not null check (
    char_length(display_name) between 1 and 3
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_members_one_family_per_user unique (user_id),
  constraint family_members_family_user_unique unique (family_id, user_id),
  constraint family_members_id_family_unique unique (id, family_id)
);

create table public.children (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 8),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint children_id_family_unique unique (id, family_id)
);

create table public.item_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  kind text not null check (kind in ('regular', 'spot', 'rough')),
  name text not null,
  default_quantity integer not null default 1 check (default_quantity >= 0),
  unit text,
  weekday smallint check (weekday is null or weekday between 0 and 6),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_templates_child_family_fk
    foreign key (child_id, family_id)
    references public.children(id, family_id)
    on delete cascade,
  constraint item_templates_id_family_unique unique (id, family_id)
);

comment on column public.item_templates.weekday is
  'Optional weekday for spot items. 0 = Sunday, 1 = Monday, ... 6 = Saturday.';

create table public.daily_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null,
  session_date date not null,
  checked_by_member_id uuid,
  checked_at timestamptz,
  prepared_by_member_id uuid,
  prepared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_sessions_child_family_fk
    foreign key (child_id, family_id)
    references public.children(id, family_id)
    on delete cascade,
  constraint daily_sessions_checked_member_family_fk
    foreign key (checked_by_member_id, family_id)
    references public.family_members(id, family_id)
    on delete restrict,
  constraint daily_sessions_prepared_member_family_fk
    foreign key (prepared_by_member_id, family_id)
    references public.family_members(id, family_id)
    on delete restrict,
  constraint daily_sessions_one_per_day unique (
    family_id,
    child_id,
    session_date
  ),
  constraint daily_sessions_id_family_unique unique (id, family_id)
);

create table public.daily_items (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  daily_session_id uuid not null,
  item_template_id uuid,
  kind text not null check (kind in ('regular', 'spot', 'rough')),
  name text not null,
  quantity integer not null default 1 check (quantity >= 0),
  unit text,
  sort_order integer not null default 0,
  is_checked boolean not null default false,
  is_prepared boolean not null default false,
  is_deferred boolean not null default false,
  due_date date,
  is_ad_hoc boolean not null default false,
  rough_state text check (
    rough_state is null or rough_state in ('enough', 'low', 'refill')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_items_session_family_fk
    foreign key (daily_session_id, family_id)
    references public.daily_sessions(id, family_id)
    on delete cascade,
  constraint daily_items_template_family_fk
    foreign key (item_template_id, family_id)
    references public.item_templates(id, family_id)
    on delete restrict,
  constraint daily_items_rough_state_kind_check
    check (kind = 'rough' or rough_state is null)
);

comment on column public.daily_items.rough_state is
  'Current rough item state. enough = sufficient, low = running low, refill = needs replenishment.';

create table public.family_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  token_hash text not null unique,
  created_by_member_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint family_invites_created_by_member_family_fk
    foreign key (created_by_member_id, family_id)
    references public.family_members(id, family_id)
    on delete restrict
);

create index family_members_family_id_idx
  on public.family_members(family_id);
create index family_members_user_id_idx
  on public.family_members(user_id);
create index children_family_id_idx
  on public.children(family_id);
create index item_templates_family_child_idx
  on public.item_templates(family_id, child_id);
create index item_templates_kind_idx
  on public.item_templates(kind);
create index daily_sessions_family_child_date_idx
  on public.daily_sessions(family_id, child_id, session_date);
create index daily_sessions_checked_by_member_idx
  on public.daily_sessions(checked_by_member_id);
create index daily_sessions_prepared_by_member_idx
  on public.daily_sessions(prepared_by_member_id);
create index daily_items_family_session_idx
  on public.daily_items(family_id, daily_session_id);
create index daily_items_template_idx
  on public.daily_items(item_template_id);
create index family_invites_family_id_idx
  on public.family_invites(family_id);
create index family_invites_created_by_member_idx
  on public.family_invites(created_by_member_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger families_set_updated_at
  before update on public.families
  for each row execute function public.set_updated_at();
create trigger family_members_set_updated_at
  before update on public.family_members
  for each row execute function public.set_updated_at();
create trigger children_set_updated_at
  before update on public.children
  for each row execute function public.set_updated_at();
create trigger item_templates_set_updated_at
  before update on public.item_templates
  for each row execute function public.set_updated_at();
create trigger daily_sessions_set_updated_at
  before update on public.daily_sessions
  for each row execute function public.set_updated_at();
create trigger daily_items_set_updated_at
  before update on public.daily_items
  for each row execute function public.set_updated_at();

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.family_members
    where family_members.family_id = target_family_id
      and family_members.user_id = auth.uid()
  );
$$;

revoke all on function public.is_family_member(uuid) from public;
grant execute on function public.is_family_member(uuid) to authenticated;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.children enable row level security;
alter table public.item_templates enable row level security;
alter table public.daily_sessions enable row level security;
alter table public.daily_items enable row level security;
alter table public.family_invites enable row level security;

revoke all on public.families from anon;
revoke all on public.family_members from anon;
revoke all on public.children from anon;
revoke all on public.item_templates from anon;
revoke all on public.daily_sessions from anon;
revoke all on public.daily_items from anon;
revoke all on public.family_invites from anon;

grant select on public.families to authenticated;
grant select on public.family_members to authenticated;
grant select, insert, update, delete on public.children to authenticated;
grant select, insert, update, delete on public.item_templates to authenticated;
grant select, insert, update, delete on public.daily_sessions to authenticated;
grant select, insert, update, delete on public.daily_items to authenticated;
grant select on public.family_invites to authenticated;

create policy families_select_family_members
  on public.families
  for select
  to authenticated
  using (public.is_family_member(id));

create policy family_members_select_family_members
  on public.family_members
  for select
  to authenticated
  using (public.is_family_member(family_id));

create policy children_select_family_members
  on public.children
  for select
  to authenticated
  using (public.is_family_member(family_id));
create policy children_insert_family_members
  on public.children
  for insert
  to authenticated
  with check (public.is_family_member(family_id));
create policy children_update_family_members
  on public.children
  for update
  to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));
create policy children_delete_family_members
  on public.children
  for delete
  to authenticated
  using (public.is_family_member(family_id));

create policy item_templates_select_family_members
  on public.item_templates
  for select
  to authenticated
  using (public.is_family_member(family_id));
create policy item_templates_insert_family_members
  on public.item_templates
  for insert
  to authenticated
  with check (public.is_family_member(family_id));
create policy item_templates_update_family_members
  on public.item_templates
  for update
  to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));
create policy item_templates_delete_family_members
  on public.item_templates
  for delete
  to authenticated
  using (public.is_family_member(family_id));

create policy daily_sessions_select_family_members
  on public.daily_sessions
  for select
  to authenticated
  using (public.is_family_member(family_id));
create policy daily_sessions_insert_family_members
  on public.daily_sessions
  for insert
  to authenticated
  with check (public.is_family_member(family_id));
create policy daily_sessions_update_family_members
  on public.daily_sessions
  for update
  to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));
create policy daily_sessions_delete_family_members
  on public.daily_sessions
  for delete
  to authenticated
  using (public.is_family_member(family_id));

create policy daily_items_select_family_members
  on public.daily_items
  for select
  to authenticated
  using (public.is_family_member(family_id));
create policy daily_items_insert_family_members
  on public.daily_items
  for insert
  to authenticated
  with check (public.is_family_member(family_id));
create policy daily_items_update_family_members
  on public.daily_items
  for update
  to authenticated
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));
create policy daily_items_delete_family_members
  on public.daily_items
  for delete
  to authenticated
  using (public.is_family_member(family_id));

create policy family_invites_select_family_members
  on public.family_invites
  for select
  to authenticated
  using (public.is_family_member(family_id));
