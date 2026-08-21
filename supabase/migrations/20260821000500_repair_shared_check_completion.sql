begin;

-- The authenticated role intentionally has no direct UPDATE privilege on
-- item_templates. Run the already authenticated and fully scoped check RPC as
-- its locked-down owner so its rough template row lock remains available.
alter function public.complete_daily_check(uuid, uuid, date, integer)
  owner to postgres;
alter function public.complete_daily_check(uuid, uuid, date, integer)
  security definer;
alter function public.complete_daily_check(uuid, uuid, date, integer)
  set search_path = '';

revoke all on function public.complete_daily_check(uuid, uuid, date, integer)
  from public, anon, authenticated;
grant execute on function public.complete_daily_check(uuid, uuid, date, integer)
  to authenticated;

comment on function public.complete_daily_check(uuid, uuid, date, integer) is
  'Completes or refreshes a scoped authenticated check and snapshots current rough states under stable row locks.';

commit;
