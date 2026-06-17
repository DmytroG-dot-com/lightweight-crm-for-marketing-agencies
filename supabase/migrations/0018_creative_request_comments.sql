begin;

create table if not exists public.creative_request_comments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  creative_request_id uuid not null,
  author_type text not null check (author_type in ('agency', 'creator')),
  author_user_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  check (
    (author_type = 'agency' and author_user_id is not null)
    or (author_type = 'creator' and author_user_id is null)
  )
);

alter table public.creative_request_comments add constraint creative_request_comments_request_agency_fkey
  foreign key (creative_request_id, agency_id) references public.creative_requests(id, agency_id) on delete cascade;

create index if not exists creative_request_comments_request_created_idx
  on public.creative_request_comments(creative_request_id, created_at);

alter table public.creative_request_comments enable row level security;

drop policy if exists "members can manage creative request comments" on public.creative_request_comments;
create policy "members can manage creative request comments"
  on public.creative_request_comments for all
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

revoke all on table public.creative_request_comments from public, anon;
grant select, insert, update, delete on table public.creative_request_comments to authenticated;
grant all privileges on table public.creative_request_comments to service_role;

update public.creative_requests
set status = 'in_progress'
where creator_id is not null
  and status = 'assigned';

alter table public.creative_requests
  drop constraint if exists creative_requests_status_check;

alter table public.creative_requests
  add constraint creative_requests_status_check
  check (status in ('draft', 'ready', 'in_progress', 'review', 'approved', 'launched', 'stopped'));

commit;
