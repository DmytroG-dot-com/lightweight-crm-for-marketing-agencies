begin;

alter table public.task_comments
  add column if not exists client_request_id uuid;

drop index if exists public.task_comments_agency_request_key;

create unique index task_comments_agency_request_key
  on public.task_comments(agency_id, author_id, client_request_id)
  where client_request_id is not null;

commit;
