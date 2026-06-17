begin;

update public.creative_requests
set status = case
  when creator_id is not null then 'in_progress'
  else 'draft'
end
where status = 'ready';

alter table public.creative_requests
  drop constraint if exists creative_requests_status_check;

alter table public.creative_requests
  add constraint creative_requests_status_check
  check (status in ('draft', 'in_progress', 'review', 'approved', 'launched', 'stopped'));

commit;
