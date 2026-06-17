begin;

create table if not exists public.client_personas (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null,
  name text not null,
  segment text,
  job_to_be_done text,
  pain_points jsonb not null default '[]'::jsonb,
  desired_outcomes jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  buying_triggers jsonb not null default '[]'::jsonb,
  awareness_stage text,
  tone_preferences text,
  claim_sensitivity text,
  offer_fit text,
  source text not null default 'manual' check (source in ('manual', 'onboarding', 'ai_research')),
  confidence_score integer check (confidence_score between 0 and 100),
  active boolean not null default true,
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists client_personas_id_agency_client_key
  on public.client_personas(id, agency_id, client_id);

alter table public.client_personas
  add constraint client_personas_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;

create unique index if not exists client_personas_primary_active_key
  on public.client_personas(agency_id, client_id)
  where is_primary and active;

create index if not exists client_personas_agency_client_active_idx
  on public.client_personas(agency_id, client_id, active, is_primary);

alter table public.creative_requests
  add column if not exists persona_id uuid,
  add column if not exists brief_json jsonb,
  add column if not exists brief_context_snapshot jsonb,
  add column if not exists brief_generated_at timestamptz;

alter table public.creative_requests
  drop constraint if exists creative_requests_persona_agency_client_fkey;

alter table public.creative_requests
  add constraint creative_requests_persona_agency_client_fkey
  foreign key (persona_id, agency_id, client_id) references public.client_personas(id, agency_id, client_id) on delete set null;

create index if not exists creative_requests_agency_persona_idx
  on public.creative_requests(agency_id, persona_id)
  where persona_id is not null and archived_at is null;

create index if not exists creative_requests_brief_generated_idx
  on public.creative_requests(agency_id, brief_generated_at desc)
  where brief_generated_at is not null and archived_at is null;

create trigger client_personas_updated_at
  before update on public.client_personas
  for each row execute function public.set_updated_at();

alter table public.client_personas enable row level security;

drop policy if exists "members can manage client personas" on public.client_personas;
create policy "members can manage client personas"
  on public.client_personas for all
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

revoke all on table public.client_personas from public, anon;
grant select, insert, update, delete on table public.client_personas to authenticated;
grant all privileges on table public.client_personas to service_role;

commit;
