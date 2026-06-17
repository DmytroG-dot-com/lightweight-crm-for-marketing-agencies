begin;

alter table public.onboarding_links
  add column if not exists draft jsonb not null default '{}'::jsonb,
  add column if not exists draft_updated_at timestamptz;

commit;
