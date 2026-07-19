begin;

alter table public.daily_sessions
  drop constraint if exists daily_sessions_checked_member_family_fk;

alter table public.daily_sessions
  add constraint daily_sessions_checked_member_family_fk
  foreign key (checked_by_member_id, family_id)
  references public.family_members(id, family_id)
  on delete set null (checked_by_member_id);

alter table public.daily_sessions
  drop constraint if exists daily_sessions_prepared_member_family_fk;

alter table public.daily_sessions
  add constraint daily_sessions_prepared_member_family_fk
  foreign key (prepared_by_member_id, family_id)
  references public.family_members(id, family_id)
  on delete set null (prepared_by_member_id);

alter table public.daily_sessions
  drop constraint if exists daily_sessions_thanks_sent_member_family_fk;

alter table public.daily_sessions
  add constraint daily_sessions_thanks_sent_member_family_fk
  foreign key (thanks_sent_by_member_id, family_id)
  references public.family_members(id, family_id)
  on delete set null (thanks_sent_by_member_id);

alter table public.daily_sessions
  drop constraint if exists daily_sessions_thanks_received_member_family_fk;

alter table public.daily_sessions
  add constraint daily_sessions_thanks_received_member_family_fk
  foreign key (thanks_received_by_member_id, family_id)
  references public.family_members(id, family_id)
  on delete set null (thanks_received_by_member_id);

alter table public.daily_items
  drop constraint if exists daily_items_updated_member_family_fk;

alter table public.daily_items
  add constraint daily_items_updated_member_family_fk
  foreign key (updated_by_member_id, family_id)
  references public.family_members(id, family_id)
  on delete set null (updated_by_member_id);

commit;
