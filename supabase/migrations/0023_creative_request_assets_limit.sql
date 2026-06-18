begin;

update public.creative_requests
set assets_needed = 10
where assets_needed > 10;

alter table public.creative_requests
  drop constraint if exists creative_requests_assets_needed_check;

alter table public.creative_requests
  add constraint creative_requests_assets_needed_check
  check (assets_needed > 0 and assets_needed <= 10);

commit;
