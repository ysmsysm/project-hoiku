begin;

alter table public.family_members
  drop constraint family_members_display_name_check;

alter table public.family_members
  add constraint family_members_display_name_check check (
    pg_catalog.char_length(display_name) between 1 and 8
  );

create temporary table pg_temp.family_member_display_name_corrections
on commit drop
as
with metadata_names as (
  select
    auth_users.id as user_id,
    nullif(
      pg_catalog.btrim(
        case
          when pg_catalog.jsonb_typeof(
            auth_users.raw_user_meta_data -> 'full_name'
          ) = 'string'
          then auth_users.raw_user_meta_data ->> 'full_name'
          else null
        end
      ),
      ''
    ) as full_name,
    nullif(
      pg_catalog.btrim(
        case
          when pg_catalog.jsonb_typeof(
            auth_users.raw_user_meta_data -> 'name'
          ) = 'string'
          then auth_users.raw_user_meta_data ->> 'name'
          else null
        end
      ),
      ''
    ) as metadata_name
  from auth.users as auth_users
), resolved_names as (
  select
    metadata_names.user_id,
    case
      when metadata_names.full_name is not null
        and (
          metadata_names.metadata_name is null
          or metadata_names.metadata_name = metadata_names.full_name
        )
      then metadata_names.full_name
      when metadata_names.metadata_name is not null
        and metadata_names.full_name is null
      then metadata_names.metadata_name
      else null
    end as display_name
  from metadata_names
)
select
  family_members.id as member_id,
  family_members.user_id,
  family_members.display_name as old_display_name,
  resolved_names.display_name as new_display_name
from public.family_members
join resolved_names
  on resolved_names.user_id = family_members.user_id
where pg_catalog.char_length(family_members.display_name) = 3
  and pg_catalog.char_length(resolved_names.display_name) between 4 and 8
  and pg_catalog.left(resolved_names.display_name, 3) = family_members.display_name;

update public.daily_sessions
set checked_by_display_name = corrections.new_display_name
from pg_temp.family_member_display_name_corrections as corrections
where daily_sessions.checked_by_member_id = corrections.member_id
  and daily_sessions.checked_by_display_name = corrections.old_display_name;

update public.daily_sessions
set prepared_by_display_name = corrections.new_display_name
from pg_temp.family_member_display_name_corrections as corrections
where daily_sessions.prepared_by_member_id = corrections.member_id
  and daily_sessions.prepared_by_display_name = corrections.old_display_name;

update public.daily_sessions
set thanks_sent_by_display_name = corrections.new_display_name
from pg_temp.family_member_display_name_corrections as corrections
where daily_sessions.thanks_sent_by_member_id = corrections.member_id
  and daily_sessions.thanks_sent_by_display_name = corrections.old_display_name;

update public.daily_sessions
set thanks_received_by_display_name = corrections.new_display_name
from pg_temp.family_member_display_name_corrections as corrections
where daily_sessions.thanks_received_by_member_id = corrections.member_id
  and daily_sessions.thanks_received_by_display_name = corrections.old_display_name;

update public.family_members
set display_name = corrections.new_display_name
from pg_temp.family_member_display_name_corrections as corrections
where family_members.id = corrections.member_id
  and family_members.user_id = corrections.user_id
  and family_members.display_name = corrections.old_display_name;

do $migration$
declare
  function_definition text;
  patched_definition text;
begin
  function_definition := pg_catalog.pg_get_functiondef(
    'public.create_family_for_current_user(text)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    'normalized_display_name := left(normalized_display_name, 3);',
    'normalized_display_name := left(normalized_display_name, 8);'
  );
  if patched_definition = function_definition then
    raise exception 'create_family_display_name_contract_not_found';
  end if;
  execute patched_definition;

  function_definition := pg_catalog.pg_get_functiondef(
    'public.accept_family_invite(text,text)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    'or pg_catalog.char_length(normalized_display_name) > 3',
    'or pg_catalog.char_length(normalized_display_name) > 8'
  );
  if patched_definition = function_definition then
    raise exception 'accept_invite_display_name_contract_not_found';
  end if;
  execute patched_definition;

  function_definition := pg_catalog.pg_get_functiondef(
    'public.update_daily_item(uuid,uuid,date,uuid,integer,text,jsonb)'::regprocedure
  );
  patched_definition := pg_catalog.replace(
    function_definition,
    'if target_session_prepared_at is not null then',
    'if target_session_prepared_at is not null
    and p_action <> ''set_observed_quantity''
  then'
  );
  if patched_definition = function_definition then
    raise exception 'daily_item_prepared_guard_not_found';
  end if;
  execute patched_definition;
end;
$migration$;

commit;
