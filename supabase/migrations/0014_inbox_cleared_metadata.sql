begin;

alter table public.notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists cleared_at timestamptz;

create index if not exists notifications_recipient_cleared_idx
  on public.notifications(recipient_id, cleared_at, created_at desc);

commit;
