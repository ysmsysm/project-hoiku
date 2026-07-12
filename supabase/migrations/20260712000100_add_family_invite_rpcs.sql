do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'family_invites_expires_after_created_check'
      and conrelid = 'public.family_invites'::regclass
  ) then
    alter table public.family_invites
      add constraint family_invites_expires_after_created_check
      check (expires_at > created_at)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'family_invites_used_or_revoked_check'
      and conrelid = 'public.family_invites'::regclass
  ) then
    alter table public.family_invites
      add constraint family_invites_used_or_revoked_check
      check (used_at is null or revoked_at is null)
      not valid;
  end if;
end;
$$;

with active_invites as (
  select
    id,
    row_number() over (
      partition by family_id
      order by created_at desc, id desc
    ) as active_rank
  from public.family_invites
  where used_at is null
    and revoked_at is null
)
update public.family_invites
set revoked_at = pg_catalog.now()
where id in (
  select id
  from active_invites
  where active_rank > 1
);

alter table public.family_invites
  validate constraint family_invites_expires_after_created_check;

alter table public.family_invites
  validate constraint family_invites_used_or_revoked_check;

create unique index if not exists family_invites_one_open_invite_per_family_idx
  on public.family_invites(family_id)
  where used_at is null
    and revoked_at is null;

drop policy if exists family_invites_select_family_members
  on public.family_invites;

revoke all on public.family_invites from public;
revoke all on public.family_invites from anon;
revoke all on public.family_invites from authenticated;

create or replace function public.create_family_invite(
  token_hash text
)
returns table (
  expires_at timestamptz
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
  normalized_token_hash text := pg_catalog.btrim(token_hash);
  new_expires_at timestamptz := pg_catalog.now() + interval '72 hours';
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = '28000';
  end if;

  if normalized_token_hash is null
    or normalized_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid_token_hash'
      using errcode = '22023';
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_family_id::text, 0)
  );

  update public.family_invites
  set revoked_at = pg_catalog.now()
  where family_invites.family_id = owner_family_id
    and family_invites.used_at is null
    and family_invites.revoked_at is null;

  insert into public.family_invites (
    family_id,
    token_hash,
    created_by_member_id,
    expires_at
  )
  values (
    owner_family_id,
    normalized_token_hash,
    owner_member_id,
    new_expires_at
  );

  expires_at := new_expires_at;
  return next;
exception
  when unique_violation then
    raise exception 'invalid_token_hash'
      using errcode = '22023';
end;
$$;

create or replace function public.get_current_family_invite_status()
returns table (
  has_active_invite boolean,
  expires_at timestamptz
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
  active_expires_at timestamptz;
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

  select family_invites.expires_at
  into active_expires_at
  from public.family_invites
  where family_invites.family_id = owner_family_id
    and family_invites.used_at is null
    and family_invites.revoked_at is null
    and family_invites.expires_at > pg_catalog.now()
  order by family_invites.created_at desc
  limit 1;

  has_active_invite := active_expires_at is not null;
  expires_at := active_expires_at;
  return next;
end;
$$;

create or replace function public.get_family_invite_status(
  token_hash text
)
returns table (
  valid boolean,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_token_hash text := pg_catalog.btrim(token_hash);
  active_expires_at timestamptz;
begin
  if normalized_token_hash is null
    or normalized_token_hash !~ '^[0-9a-f]{64}$'
  then
    valid := false;
    expires_at := null;
    return next;
  end if;

  select family_invites.expires_at
  into active_expires_at
  from public.family_invites
  where family_invites.token_hash = normalized_token_hash
    and family_invites.used_at is null
    and family_invites.revoked_at is null
    and family_invites.expires_at > pg_catalog.now()
    and exists (
      select 1
      from public.families
      where families.id = family_invites.family_id
    )
  limit 1;

  valid := active_expires_at is not null;
  expires_at := active_expires_at;
  return next;
end;
$$;

create or replace function public.accept_family_invite(
  token_hash text,
  display_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_token_hash text := pg_catalog.btrim(token_hash);
  normalized_display_name text := nullif(pg_catalog.btrim(display_name), '');
  invite_record record;
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = '28000';
  end if;

  if normalized_token_hash is null
    or normalized_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid_token_hash'
      using errcode = '22023';
  end if;

  if normalized_display_name is null
    or pg_catalog.char_length(normalized_display_name) < 1
    or pg_catalog.char_length(normalized_display_name) > 3
  then
    raise exception 'invalid_display_name'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select
    family_invites.id,
    family_invites.family_id,
    family_invites.expires_at,
    family_invites.used_at,
    family_invites.revoked_at
  into invite_record
  from public.family_invites
  where family_invites.token_hash = normalized_token_hash
  for update;

  if invite_record.id is null then
    raise exception 'invite_not_found'
      using errcode = 'P0001';
  end if;

  if invite_record.used_at is not null then
    raise exception 'invite_already_used'
      using errcode = '23505';
  end if;

  if invite_record.revoked_at is not null then
    raise exception 'invite_revoked'
      using errcode = 'P0001';
  end if;

  if invite_record.expires_at <= pg_catalog.now() then
    raise exception 'invite_expired'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.families
    where families.id = invite_record.family_id
  ) then
    raise exception 'family_not_found'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.family_members
    where family_members.user_id = current_user_id
  ) then
    raise exception 'already_family_member'
      using errcode = '23505';
  end if;

  insert into public.family_members (
    family_id,
    user_id,
    role,
    display_name
  )
  values (
    invite_record.family_id,
    current_user_id,
    'member',
    normalized_display_name
  );

  update public.family_invites
  set
    used_at = pg_catalog.now(),
    used_by_user_id = current_user_id
  where family_invites.id = invite_record.id
    and family_invites.used_at is null
    and family_invites.revoked_at is null;

  if not found then
    raise exception 'invite_already_used'
      using errcode = '23505';
  end if;

  return true;
exception
  when unique_violation then
    raise exception 'already_family_member'
      using errcode = '23505';
end;
$$;

create or replace function public.revoke_family_invite()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  owner_member_id uuid;
  owner_family_id uuid;
  owner_role text;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_family_id::text, 0)
  );

  update public.family_invites
  set revoked_at = pg_catalog.now()
  where family_invites.family_id = owner_family_id
    and family_invites.used_at is null
    and family_invites.revoked_at is null;

  return found;
end;
$$;

revoke all on function public.create_family_invite(text) from public;
revoke all on function public.get_current_family_invite_status() from public;
revoke all on function public.get_family_invite_status(text) from public;
revoke all on function public.accept_family_invite(text, text) from public;
revoke all on function public.revoke_family_invite() from public;

grant execute on function public.create_family_invite(text) to authenticated;
grant execute on function public.get_current_family_invite_status() to authenticated;
grant execute on function public.get_family_invite_status(text) to anon, authenticated;
grant execute on function public.accept_family_invite(text, text) to authenticated;
grant execute on function public.revoke_family_invite() to authenticated;
