create or replace function public.create_family_for_current_user(
  owner_display_name text
)
returns table (
  family_id uuid,
  member_id uuid,
  role text,
  display_name text
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  new_family_id uuid;
  new_member_id uuid;
  normalized_display_name text := nullif(btrim(owner_display_name), '');
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = '28000';
  end if;

  if normalized_display_name is null then
    normalized_display_name := 'me';
  end if;

  normalized_display_name := left(normalized_display_name, 3);

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  if exists (
    select 1
    from public.family_members
    where user_id = current_user_id
  ) then
    raise exception 'already_family_member'
      using errcode = '23505';
  end if;

  insert into public.families
  default values
  returning id into new_family_id;

  insert into public.family_members (
    family_id,
    user_id,
    role,
    display_name
  )
  values (
    new_family_id,
    current_user_id,
    'owner',
    normalized_display_name
  )
  returning id into new_member_id;

  family_id := new_family_id;
  member_id := new_member_id;
  role := 'owner';
  display_name := normalized_display_name;

  return next;
end;
$$;

revoke all on function public.create_family_for_current_user(text) from public;
grant execute on function public.create_family_for_current_user(text) to authenticated;
