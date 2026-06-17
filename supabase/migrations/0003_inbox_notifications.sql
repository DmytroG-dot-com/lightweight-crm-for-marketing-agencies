begin;

create table public.task_watchers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  task_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  recipient_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  client_id uuid not null,
  task_id uuid not null,
  comment_id uuid,
  kind text not null check (kind in ('mention', 'comment_added', 'status_changed')),
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.task_watchers add constraint task_watchers_task_agency_fkey
  foreign key (task_id, agency_id) references public.tasks(id, agency_id) on delete cascade;
alter table public.task_watchers add constraint task_watchers_member_agency_fkey
  foreign key (agency_id, user_id) references public.agency_members(agency_id, user_id) on delete cascade;

alter table public.notifications add constraint notifications_recipient_agency_fkey
  foreign key (agency_id, recipient_id) references public.agency_members(agency_id, user_id) on delete cascade;
alter table public.notifications add constraint notifications_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;
alter table public.notifications add constraint notifications_task_agency_client_fkey
  foreign key (task_id, agency_id, client_id) references public.tasks(id, agency_id, client_id) on delete cascade;
alter table public.notifications add constraint notifications_comment_agency_fkey
  foreign key (comment_id, agency_id) references public.task_comments(id, agency_id) on delete cascade;

create index task_watchers_task_idx on public.task_watchers(task_id);
create index task_watchers_user_idx on public.task_watchers(agency_id, user_id);
create index notifications_recipient_unread_idx on public.notifications(recipient_id, read_at, created_at desc);

alter table public.task_watchers enable row level security;
alter table public.notifications enable row level security;

create policy "members can read task watchers"
  on public.task_watchers for select
  using (public.is_agency_member(agency_id));
create policy "members can watch themselves"
  on public.task_watchers for insert
  with check (public.is_agency_member(agency_id) and user_id = auth.uid());
create policy "members can unwatch themselves"
  on public.task_watchers for delete
  using (public.is_agency_member(agency_id) and user_id = auth.uid());

create policy "members can create agency notifications"
  on public.notifications for insert
  with check (public.is_agency_member(agency_id));
create policy "recipients can read notifications"
  on public.notifications for select
  using (recipient_id = auth.uid() and public.is_agency_member(agency_id));
create policy "recipients can update notifications"
  on public.notifications for update
  using (recipient_id = auth.uid() and public.is_agency_member(agency_id))
  with check (recipient_id = auth.uid() and public.is_agency_member(agency_id));
create policy "recipients can delete notifications"
  on public.notifications for delete
  using (recipient_id = auth.uid() and public.is_agency_member(agency_id));

revoke all on table public.task_watchers, public.notifications from public, anon;
grant select, insert, delete on table public.task_watchers to authenticated;
grant select, insert, update, delete on table public.notifications to authenticated;
grant all privileges on table public.task_watchers, public.notifications to service_role;

commit;
