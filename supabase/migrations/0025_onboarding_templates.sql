create table if not exists public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  description text,
  schema jsonb not null,
  is_default boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists onboarding_templates_id_agency_key
  on public.onboarding_templates(id, agency_id);

create unique index if not exists onboarding_templates_default_agency_key
  on public.onboarding_templates(agency_id)
  where is_default;

create index if not exists onboarding_templates_agency_created_idx
  on public.onboarding_templates(agency_id, created_at desc);

alter table public.onboarding_links
  add column if not exists template_id uuid,
  add column if not exists template_name text,
  add column if not exists template_schema jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'onboarding_links_template_agency_fkey'
  ) then
    alter table public.onboarding_links
      add constraint onboarding_links_template_agency_fkey
      foreign key (template_id, agency_id)
      references public.onboarding_templates(id, agency_id)
      on delete set null;
  end if;
end $$;

drop trigger if exists onboarding_templates_updated_at on public.onboarding_templates;
create trigger onboarding_templates_updated_at
  before update on public.onboarding_templates
  for each row execute function public.set_updated_at();

alter table public.onboarding_templates enable row level security;

drop policy if exists "members can manage onboarding templates" on public.onboarding_templates;
create policy "members can manage onboarding templates"
  on public.onboarding_templates
  for all
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

revoke all on table public.onboarding_templates from public, anon;

grant select, insert, update, delete on table public.onboarding_templates to authenticated;
grant all privileges on table public.onboarding_templates to service_role;
