begin;

-- Agency CRM fresh-project bootstrap, consolidated through migration 0022.
-- Run this file once in a new Supabase project's SQL editor. Do not run the
-- numbered migrations afterward; they are only for incrementally upgrading an
-- existing project.
--
-- Destructive when rerun: removes only Agency CRM objects in the public
-- schema. Supabase Auth users in auth.users are not deleted.
drop table if exists
  public.creative_assignments,
  public.creative_request_comments,
  public.external_creators,
  public.creative_requests,
  public.client_personas,
  public.onboarding_submissions,
  public.onboarding_links,
  public.activity_logs,
  public.dossiers,
  public.notifications,
  public.task_watchers,
  public.task_comment_attachments,
  public.task_comments,
  public.tasks,
  public.recurring_task_rules,
  public.task_lists,
  public.clients,
  public.team_invitations,
  public.ai_team_reports,
  public.agency_ai_settings,
  public.agency_members,
  public.agencies
cascade;

drop function if exists public.provision_user_agency(uuid, text, uuid) cascade;
drop function if exists public.generate_unique_task_share_code() cascade;
drop function if exists public.generate_short_code(integer) cascade;
drop function if exists public.get_team_report_metrics(uuid, timestamptz, timestamptz) cascade;
drop function if exists public.get_team_dashboard_metrics(uuid, timestamptz) cascade;
drop function if exists public.restore_client_workspace(uuid, uuid) cascade;
drop function if exists public.archive_client_workspace(uuid, uuid, timestamptz) cascade;
drop function if exists public.restore_task_tree(uuid, uuid, uuid) cascade;
drop function if exists public.archive_task_tree(uuid, uuid, uuid, timestamptz) cascade;
drop function if exists public.move_task_tree_to_list(uuid, uuid, uuid, uuid) cascade;
drop function if exists public.is_agency_admin(uuid) cascade;
drop function if exists public.is_agency_member(uuid) cascade;
drop function if exists public.set_task_completion() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.storage_path_agency_id(text) cascade;

create extension if not exists pgcrypto with schema extensions;

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  display_name text,
  email text,
  timezone text not null default 'America/New_York',
  timezone_auto boolean not null default true,
  created_at timestamptz not null default now(),
  unique (agency_id, user_id),
  unique (user_id)
);

create table public.agency_ai_settings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  provider text not null default 'openai' check (provider in ('openai')),
  encrypted_api_key text,
  model text not null default 'gpt-5.4-mini',
  image_model text not null default 'gpt-image-1',
  enabled boolean not null default true,
  task_prompt text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id)
);

create table public.ai_team_reports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  period_key text not null check (period_key in ('last_week', 'this_week', 'last_30_days')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  focus text,
  report jsonb not null,
  model text not null,
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_end > period_start)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  company_name text,
  contact_name text,
  contact_email text,
  website text,
  notes text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  archived_at timestamptz,
  previous_status text check (previous_status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null,
  name text not null,
  kind text not null default 'custom' check (kind in ('general', 'recurring', 'custom')),
  archived_at timestamptz,
  archived_by_client_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null,
  share_code text,
  task_list_id uuid not null,
  parent_task_id uuid,
  source_recurring_rule_id uuid,
  occurrence_date date,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'blocked', 'complete')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee_id uuid references auth.users(id) on delete set null,
  start_date date,
  due_date date,
  completed_at timestamptz,
  completed_assignee_id uuid references auth.users(id) on delete set null,
  original_context text,
  ai_generated boolean not null default false,
  ai_metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  archived_by_client_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_recurring_rule_id, occurrence_date)
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  task_id uuid not null,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  client_request_id uuid,
  created_at timestamptz not null default now()
);

create table public.task_comment_attachments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  comment_id uuid not null,
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  size_bytes bigint not null check (size_bytes >= 0),
  created_at timestamptz not null default now()
);

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
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  cleared_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.recurring_task_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null,
  task_list_id uuid not null,
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee_id uuid references auth.users(id) on delete set null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  interval_count integer not null default 1 check (interval_count > 0),
  next_run_at date not null,
  due_offset_days integer not null default 0 check (due_offset_days >= 0),
  skip_weekends boolean not null default false,
  active boolean not null default true,
  paused_by_client_at timestamptz,
  was_active_before_client_archive boolean,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dossiers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null,
  business_basics jsonb not null default '{}'::jsonb,
  audience jsonb not null default '{}'::jsonb,
  offer jsonb not null default '{}'::jsonb,
  competitors jsonb not null default '{}'::jsonb,
  proof jsonb not null default '{}'::jsonb,
  founder_story jsonb not null default '{}'::jsonb,
  pricing jsonb not null default '{}'::jsonb,
  creative_strategy jsonb not null default '{}'::jsonb,
  messaging jsonb not null default '{}'::jsonb,
  knowledge_base text,
  ai_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id)
);

create table public.client_personas (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null,
  name text not null,
  segment text,
  profile_summary text,
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

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.onboarding_links (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null,
  token uuid not null default gen_random_uuid() unique,
  expires_at timestamptz,
  active boolean not null default true,
  draft jsonb not null default '{}'::jsonb,
  draft_updated_at timestamptz,
  archived_by_client_at timestamptz,
  was_active_before_client_archive boolean,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.onboarding_submissions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null,
  onboarding_link_id uuid not null,
  submission jsonb not null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (onboarding_link_id)
);

create table public.creative_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  order_number bigint generated always as identity,
  client_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'in_progress', 'review', 'approved', 'launched', 'stopped')),
  title text not null,
  hypothesis text not null,
  preferred_launch_date date not null default (current_date + 4),
  due_date date not null default (current_date + 4),
  assets_needed integer not null default 1 check (assets_needed > 0 and assets_needed <= 10),
  brief text,
  brief_json jsonb,
  brief_context_snapshot jsonb,
  brief_generated_at timestamptz,
  references_url text,
  creator_id uuid,
  persona_id uuid,
  source_task_id uuid,
  notes text,
  completed_drive_folder_url text,
  submitted_at timestamptz,
  archived_at timestamptz,
  archived_by_client_at timestamptz,
  ad_names text[] not null default '{}',
  comments text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.creative_request_comments (
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

create table public.external_creators (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  email text not null,
  portal_token uuid not null default gen_random_uuid() unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.creative_assignments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  creative_request_id uuid not null,
  creator_id uuid not null,
  asset_name text not null,
  status text not null default 'assigned' check (status in ('assigned', 'in_progress', 'review', 'approved')),
  completed_drive_folder_url text,
  comments text,
  assigned_at timestamptz not null default now(),
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Composite relationships prevent cross-agency references even when callers
-- bypass the application and write through the authenticated Supabase API.
create unique index clients_id_agency_key on public.clients(id, agency_id);
create unique index task_lists_id_agency_client_key on public.task_lists(id, agency_id, client_id);
create unique index tasks_id_agency_client_key on public.tasks(id, agency_id, client_id);
create unique index tasks_id_agency_key on public.tasks(id, agency_id);
create unique index task_comments_id_agency_key on public.task_comments(id, agency_id);
create unique index task_comments_agency_request_key on public.task_comments(agency_id, author_id, client_request_id) where client_request_id is not null;
create unique index recurring_rules_id_agency_client_key on public.recurring_task_rules(id, agency_id, client_id);
create unique index onboarding_links_id_agency_client_key on public.onboarding_links(id, agency_id, client_id);
create unique index client_personas_id_agency_client_key on public.client_personas(id, agency_id, client_id);
create unique index creative_requests_id_agency_key on public.creative_requests(id, agency_id);
create unique index external_creators_id_agency_key on public.external_creators(id, agency_id);
create unique index client_personas_primary_active_key on public.client_personas(agency_id, client_id) where is_primary and active;

alter table public.task_lists add constraint task_lists_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;
alter table public.tasks add constraint tasks_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;
alter table public.tasks add constraint tasks_list_agency_client_fkey
  foreign key (task_list_id, agency_id, client_id) references public.task_lists(id, agency_id, client_id);
alter table public.tasks add constraint tasks_parent_agency_client_fkey
  foreign key (parent_task_id, agency_id, client_id) references public.tasks(id, agency_id, client_id);
alter table public.tasks add constraint tasks_rule_agency_client_fkey
  foreign key (source_recurring_rule_id, agency_id, client_id) references public.recurring_task_rules(id, agency_id, client_id);
alter table public.task_comments add constraint task_comments_task_agency_fkey
  foreign key (task_id, agency_id) references public.tasks(id, agency_id) on delete cascade;
alter table public.task_comment_attachments add constraint task_comment_attachments_comment_agency_fkey
  foreign key (comment_id, agency_id) references public.task_comments(id, agency_id) on delete cascade;
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
alter table public.recurring_task_rules add constraint recurring_rules_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;
alter table public.recurring_task_rules add constraint recurring_rules_list_agency_client_fkey
  foreign key (task_list_id, agency_id, client_id) references public.task_lists(id, agency_id, client_id);
alter table public.dossiers add constraint dossiers_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;
alter table public.client_personas add constraint client_personas_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;
alter table public.activity_logs add constraint activity_logs_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;
alter table public.onboarding_links add constraint onboarding_links_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;
alter table public.onboarding_submissions add constraint onboarding_submissions_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;
alter table public.onboarding_submissions add constraint onboarding_submissions_link_agency_client_fkey
  foreign key (onboarding_link_id, agency_id, client_id) references public.onboarding_links(id, agency_id, client_id) on delete cascade;
alter table public.creative_requests add constraint creative_requests_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;
alter table public.creative_requests add constraint creative_requests_creator_agency_fkey
  foreign key (creator_id, agency_id) references public.external_creators(id, agency_id) on delete set null;
alter table public.creative_requests add constraint creative_requests_persona_agency_client_fkey
  foreign key (persona_id, agency_id, client_id) references public.client_personas(id, agency_id, client_id) on delete set null;
alter table public.creative_requests add constraint creative_requests_source_task_agency_client_fkey
  foreign key (source_task_id, agency_id, client_id) references public.tasks(id, agency_id, client_id) on delete set null;
alter table public.creative_request_comments add constraint creative_request_comments_request_agency_fkey
  foreign key (creative_request_id, agency_id) references public.creative_requests(id, agency_id) on delete cascade;
alter table public.creative_assignments add constraint creative_assignments_request_agency_fkey
  foreign key (creative_request_id, agency_id) references public.creative_requests(id, agency_id) on delete cascade;
alter table public.creative_assignments add constraint creative_assignments_creator_agency_fkey
  foreign key (creator_id, agency_id) references public.external_creators(id, agency_id) on delete cascade;

create index clients_agency_id_idx on public.clients(agency_id);
create index clients_agency_status_idx on public.clients(agency_id, status);
create index task_lists_agency_client_idx on public.task_lists(agency_id, client_id);
create index tasks_agency_assignee_idx on public.tasks(agency_id, assignee_id);
create index tasks_client_due_idx on public.tasks(client_id, due_date);
create index tasks_agency_client_list_open_due_idx on public.tasks(agency_id, client_id, task_list_id, due_date) where archived_at is null;
create index tasks_agency_assignee_open_due_idx on public.tasks(agency_id, assignee_id, due_date) where archived_at is null;
create index tasks_agency_open_due_idx on public.tasks(agency_id, due_date) where archived_at is null and status <> 'complete';
create index tasks_agency_completed_idx on public.tasks(agency_id, completed_at desc) where completed_at is not null;
create index task_comments_agency_author_created_idx on public.task_comments(agency_id, author_id, created_at desc);
create index task_comments_task_created_idx on public.task_comments(task_id, created_at);
create index task_comment_attachments_comment_idx on public.task_comment_attachments(comment_id);
create index task_watchers_task_idx on public.task_watchers(task_id);
create index task_watchers_user_idx on public.task_watchers(agency_id, user_id);
create index notifications_recipient_unread_idx on public.notifications(recipient_id, read_at, created_at desc);
create index notifications_recipient_cleared_idx on public.notifications(recipient_id, cleared_at, created_at desc);
create index recurring_rules_due_idx on public.recurring_task_rules(active, next_run_at);
create index recurring_rules_agency_client_idx on public.recurring_task_rules(agency_id, client_id);
create index client_personas_agency_client_active_idx on public.client_personas(agency_id, client_id, active, is_primary);
create index activity_logs_client_idx on public.activity_logs(client_id, created_at desc);
create index activity_logs_agency_created_idx on public.activity_logs(agency_id, created_at desc);
create index ai_team_reports_agency_created_idx on public.ai_team_reports(agency_id, created_at desc);
create index onboarding_links_agency_client_idx on public.onboarding_links(agency_id, client_id);
create index creative_requests_agency_idx on public.creative_requests(agency_id, due_date);
create index creative_requests_agency_persona_idx on public.creative_requests(agency_id, persona_id) where persona_id is not null and archived_at is null;
create index creative_requests_agency_creator_idx on public.creative_requests(agency_id, creator_id, status, due_date) where creator_id is not null and archived_at is null;
create index creative_requests_agency_source_task_idx on public.creative_requests(agency_id, source_task_id) where source_task_id is not null and archived_at is null;
create index creative_requests_agency_archived_idx on public.creative_requests(agency_id, archived_at desc) where archived_at is not null;
create index creative_requests_brief_generated_idx on public.creative_requests(agency_id, brief_generated_at desc) where brief_generated_at is not null and archived_at is null;
create index creative_request_comments_request_created_idx on public.creative_request_comments(creative_request_id, created_at);
create index creative_assignments_creator_idx on public.creative_assignments(creator_id, status);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_task_completion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'complete' then
    if tg_op = 'INSERT' then
      new.completed_at = now();
      new.completed_assignee_id = new.assignee_id;
    elsif old.status is distinct from 'complete' or new.completed_at is null then
      new.completed_at = now();
      new.completed_assignee_id = new.assignee_id;
    end if;
  elsif new.status <> 'complete' then
    new.completed_at = null;
    new.completed_assignee_id = null;
  end if;
  return new;
end;
$$;

create or replace function public.generate_short_code(code_length integer default 10)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  alphabet_length integer := length(alphabet);
  bytes bytea;
  result text := '';
  idx integer;
begin
  if code_length < 8 then
    raise exception 'Short codes must be at least 8 characters.';
  end if;

  bytes := extensions.gen_random_bytes(code_length);

  for idx in 0..code_length - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, idx) % alphabet_length) + 1, 1);
  end loop;

  return result;
end;
$$;

create or replace function public.generate_unique_task_share_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := public.generate_short_code(10);
    exit when not exists (
      select 1
      from public.tasks
      where share_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

update public.tasks
set share_code = public.generate_unique_task_share_code()
where share_code is null;

alter table public.tasks
  alter column share_code set default public.generate_unique_task_share_code(),
  alter column share_code set not null;

create unique index tasks_share_code_key on public.tasks(share_code);

create trigger agencies_updated_at before update on public.agencies for each row execute function public.set_updated_at();
create trigger agency_ai_settings_updated_at before update on public.agency_ai_settings for each row execute function public.set_updated_at();
create trigger clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger tasks_completion before insert or update of status on public.tasks for each row execute function public.set_task_completion();
create trigger recurring_rules_updated_at before update on public.recurring_task_rules for each row execute function public.set_updated_at();
create trigger dossiers_updated_at before update on public.dossiers for each row execute function public.set_updated_at();
create trigger client_personas_updated_at before update on public.client_personas for each row execute function public.set_updated_at();
create trigger creative_requests_updated_at before update on public.creative_requests for each row execute function public.set_updated_at();
create trigger external_creators_updated_at before update on public.external_creators for each row execute function public.set_updated_at();
create trigger creative_assignments_updated_at before update on public.creative_assignments for each row execute function public.set_updated_at();

create or replace function public.is_agency_member(target_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agency_members
    where agency_id = target_agency_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_agency_admin(target_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agency_members
    where agency_id = target_agency_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.storage_path_agency_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.move_task_tree_to_list(
  target_agency_id uuid,
  target_client_id uuid,
  target_task_id uuid,
  target_task_list_id uuid
)
returns table(id uuid, title text)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_agency_member(target_agency_id) then
    raise exception 'Agency membership is required.';
  end if;

  if not exists (
    select 1
    from public.task_lists as list
    where list.id = target_task_list_id
      and list.agency_id = target_agency_id
      and list.client_id = target_client_id
      and list.archived_at is null
  ) then
    raise exception 'Destination task list must be active and belong to this client.';
  end if;

  if not exists (
    select 1
    from public.tasks as task
    where task.id = target_task_id
      and task.agency_id = target_agency_id
      and task.client_id = target_client_id
  ) then
    raise exception 'Task not found.';
  end if;

  return query
  with recursive task_tree(task_id) as (
    select task.id
    from public.tasks as task
    where task.id = target_task_id
      and task.agency_id = target_agency_id
      and task.client_id = target_client_id

    union

    select child.id
    from public.tasks as child
    join task_tree on child.parent_task_id = task_tree.task_id
    where child.agency_id = target_agency_id
      and child.client_id = target_client_id
  )
  update public.tasks as task
  set task_list_id = target_task_list_id
  from task_tree
  where task.id = task_tree.task_id
    and task.agency_id = target_agency_id
    and task.client_id = target_client_id
  returning task.id, task.title;
end;
$$;

create or replace function public.archive_task_tree(
  target_agency_id uuid,
  target_client_id uuid,
  target_task_id uuid,
  target_archived_at timestamptz
)
returns table(id uuid, title text)
language sql
security invoker
set search_path = public
as $$
  with recursive task_tree(id) as (
    select task.id
    from public.tasks as task
    where task.id = target_task_id
      and task.agency_id = target_agency_id
      and task.client_id = target_client_id

    union

    select child.id
    from public.tasks as child
    join task_tree on child.parent_task_id = task_tree.id
    where child.agency_id = target_agency_id
      and child.client_id = target_client_id
  )
  update public.tasks as task
  set archived_at = target_archived_at
  from task_tree
  where task.id = task_tree.id
    and task.agency_id = target_agency_id
    and task.client_id = target_client_id
    and task.archived_at is null
  returning task.id, task.title;
$$;

create or replace function public.restore_task_tree(
  target_agency_id uuid,
  target_client_id uuid,
  target_task_id uuid
)
returns table(id uuid, title text)
language sql
security invoker
set search_path = public
as $$
  with recursive root_task(id, archived_at) as (
    select task.id, task.archived_at
    from public.tasks as task
    where task.id = target_task_id
      and task.agency_id = target_agency_id
      and task.client_id = target_client_id
  ),
  task_tree(id) as (
    select root_task.id
    from root_task

    union

    select child.id
    from public.tasks as child
    join task_tree on child.parent_task_id = task_tree.id
    where child.agency_id = target_agency_id
      and child.client_id = target_client_id
  )
  update public.tasks as task
  set archived_at = null
  from task_tree, root_task
  where task.id = task_tree.id
    and task.agency_id = target_agency_id
    and task.client_id = target_client_id
    and root_task.archived_at is not null
    and task.archived_at = root_task.archived_at
  returning task.id, task.title;
$$;

create or replace function public.archive_client_workspace(
  target_agency_id uuid,
  target_client_id uuid,
  target_archived_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  client_status text;
  task_count integer;
  list_count integer;
  rule_count integer;
  link_count integer;
  creative_request_count integer;
begin
  if not public.is_agency_admin(target_agency_id) then
    raise exception 'Only agency owners and admins can archive clients.';
  end if;
  if target_archived_at is null then
    raise exception 'Archive timestamp is required.';
  end if;

  select status
  into client_status
  from public.clients
  where id = target_client_id and agency_id = target_agency_id
  for update;

  if not found then raise exception 'Client not found.'; end if;
  if client_status = 'archived' then raise exception 'Client is already archived.'; end if;

  update public.tasks
  set archived_at = target_archived_at,
      archived_by_client_at = target_archived_at
  where agency_id = target_agency_id
    and client_id = target_client_id
    and archived_at is null;
  get diagnostics task_count = row_count;

  update public.task_lists
  set archived_at = target_archived_at,
      archived_by_client_at = target_archived_at
  where agency_id = target_agency_id
    and client_id = target_client_id
    and archived_at is null;
  get diagnostics list_count = row_count;

  update public.recurring_task_rules
  set active = false,
      paused_by_client_at = target_archived_at,
      was_active_before_client_archive = active
  where agency_id = target_agency_id
    and client_id = target_client_id
    and paused_by_client_at is null;
  get diagnostics rule_count = row_count;

  update public.onboarding_links
  set active = false,
      archived_by_client_at = target_archived_at,
      was_active_before_client_archive = active
  where agency_id = target_agency_id
    and client_id = target_client_id
    and archived_by_client_at is null;
  get diagnostics link_count = row_count;

  update public.creative_requests
  set archived_at = coalesce(archived_at, target_archived_at),
      archived_by_client_at = target_archived_at
  where agency_id = target_agency_id
    and client_id = target_client_id
    and archived_by_client_at is null;
  get diagnostics creative_request_count = row_count;

  update public.clients
  set previous_status = client_status,
      status = 'archived',
      archived_at = target_archived_at
  where id = target_client_id and agency_id = target_agency_id;

  return jsonb_build_object(
    'tasks', task_count,
    'task_lists', list_count,
    'recurring_rules', rule_count,
    'onboarding_links', link_count,
    'creative_requests', creative_request_count
  );
end;
$$;

create or replace function public.restore_client_workspace(
  target_agency_id uuid,
  target_client_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  archive_marker timestamptz;
  restore_status text;
  task_count integer;
  list_count integer;
  rule_count integer;
  link_count integer;
  creative_request_count integer;
begin
  if not public.is_agency_admin(target_agency_id) then
    raise exception 'Only agency owners and admins can restore clients.';
  end if;

  select archived_at, coalesce(previous_status, 'active')
  into archive_marker, restore_status
  from public.clients
  where id = target_client_id
    and agency_id = target_agency_id
    and status = 'archived'
  for update;

  if not found or archive_marker is null then raise exception 'Archived client not found.'; end if;

  update public.task_lists
  set archived_at = case when archived_at = archive_marker then null else archived_at end,
      archived_by_client_at = null
  where agency_id = target_agency_id
    and client_id = target_client_id
    and archived_by_client_at = archive_marker;
  get diagnostics list_count = row_count;

  update public.tasks
  set archived_at = case when archived_at = archive_marker then null else archived_at end,
      archived_by_client_at = null
  where agency_id = target_agency_id
    and client_id = target_client_id
    and archived_by_client_at = archive_marker;
  get diagnostics task_count = row_count;

  update public.recurring_task_rules
  set active = coalesce(was_active_before_client_archive, false),
      next_run_at = case
        when coalesce(was_active_before_client_archive, false) then greatest(next_run_at, current_date)
        else next_run_at
      end,
      paused_by_client_at = null,
      was_active_before_client_archive = null
  where agency_id = target_agency_id
    and client_id = target_client_id
    and paused_by_client_at = archive_marker;
  get diagnostics rule_count = row_count;

  update public.onboarding_links
  set active = coalesce(was_active_before_client_archive, false)
        and (expires_at is null or expires_at > now()),
      archived_by_client_at = null,
      was_active_before_client_archive = null
  where agency_id = target_agency_id
    and client_id = target_client_id
    and archived_by_client_at = archive_marker;
  get diagnostics link_count = row_count;

  update public.creative_requests
  set archived_at = case when archived_at = archive_marker then null else archived_at end,
      archived_by_client_at = null
  where agency_id = target_agency_id
    and client_id = target_client_id
    and archived_by_client_at = archive_marker;
  get diagnostics creative_request_count = row_count;

  update public.clients
  set status = restore_status,
      archived_at = null,
      previous_status = null
  where id = target_client_id and agency_id = target_agency_id;

  return jsonb_build_object(
    'tasks', task_count,
    'task_lists', list_count,
    'recurring_rules', rule_count,
    'onboarding_links', link_count,
    'creative_requests', creative_request_count,
    'status', restore_status
  );
end;
$$;

create or replace function public.get_team_dashboard_metrics(
  target_agency_id uuid,
  range_start timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_agency_admin(target_agency_id) then
    raise exception 'Only agency owners and admins can view team reporting.';
  end if;

  with
  active_clients as (
    select id, name
    from public.clients
    where agency_id = target_agency_id and status <> 'archived'
  ),
  open_tasks as (
    select task.id, task.client_id, task.assignee_id, task.due_date
    from public.tasks as task
    join active_clients as client on client.id = task.client_id
    where task.agency_id = target_agency_id
      and task.archived_at is null
      and task.status <> 'complete'
  ),
  completed_tasks as (
    select task.id, task.client_id, task.completed_assignee_id
    from public.tasks as task
    join active_clients as client on client.id = task.client_id
    where task.agency_id = target_agency_id
      and task.archived_at is null
      and task.status = 'complete'
      and task.completed_at >= range_start
  ),
  recent_comments as (
    select comment.id, comment.author_id
    from public.task_comments as comment
    join public.tasks as task
      on task.id = comment.task_id and task.agency_id = comment.agency_id
    join active_clients as client on client.id = task.client_id
    where comment.agency_id = target_agency_id
      and comment.created_at >= range_start
      and task.archived_at is null
  ),
  recent_activity as (
    select activity.id, activity.client_id
    from public.activity_logs as activity
    join active_clients as client on client.id = activity.client_id
    where activity.agency_id = target_agency_id
      and activity.created_at >= range_start
  ),
  client_metrics as (
    select
      client.id,
      client.name,
      (select count(*) from open_tasks where client_id = client.id)::integer as open_tasks,
      (select count(*) from completed_tasks where client_id = client.id)::integer as completed_tasks,
      (select count(*) from recent_activity where client_id = client.id)::integer as activity_count
    from active_clients as client
  ),
  assignee_metrics as (
    select
      member.user_id,
      coalesce(member.display_name, member.email, 'Member') as name,
      (select count(*) from open_tasks where assignee_id = member.user_id)::integer as open_tasks,
      (select count(*) from open_tasks where assignee_id = member.user_id and due_date < current_date)::integer as overdue_tasks,
      (select count(*) from completed_tasks where completed_assignee_id = member.user_id)::integer as completed_tasks,
      (select count(*) from recent_comments where author_id = member.user_id)::integer as comments_added
    from public.agency_members as member
    where member.agency_id = target_agency_id
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'open_tasks', (select count(*) from open_tasks),
      'overdue_tasks', (select count(*) from open_tasks where due_date < current_date),
      'completed_tasks', (select count(*) from completed_tasks),
      'comments_added', (select count(*) from recent_comments),
      'activity_count', (select count(*) from recent_activity)
    ),
    'clients', coalesce((
      select jsonb_agg(to_jsonb(client_metrics) order by open_tasks desc, name)
      from client_metrics
    ), '[]'::jsonb),
    'assignees', coalesce((
      select jsonb_agg(to_jsonb(assignee_metrics) order by open_tasks desc, name)
      from assignee_metrics
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

create or replace function public.get_team_report_metrics(
  target_agency_id uuid,
  range_start timestamptz,
  range_end timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_agency_admin(target_agency_id) then
    raise exception 'Only agency owners and admins can view team reporting.';
  end if;
  if range_end <= range_start then raise exception 'Invalid reporting period.'; end if;

  with
  active_clients as (
    select id, name
    from public.clients
    where agency_id = target_agency_id and status <> 'archived'
  ),
  open_tasks as (
    select task.id, task.client_id, task.assignee_id, task.due_date
    from public.tasks as task
    join active_clients as client on client.id = task.client_id
    where task.agency_id = target_agency_id
      and task.archived_at is null
      and task.status <> 'complete'
  ),
  completed_tasks as (
    select task.id, task.client_id, task.completed_assignee_id
    from public.tasks as task
    join active_clients as client on client.id = task.client_id
    where task.agency_id = target_agency_id
      and task.archived_at is null
      and task.status = 'complete'
      and task.completed_at >= range_start
      and task.completed_at < range_end
  ),
  recent_comments as (
    select comment.id, comment.author_id
    from public.task_comments as comment
    join public.tasks as task on task.id = comment.task_id and task.agency_id = comment.agency_id
    join active_clients as client on client.id = task.client_id
    where comment.agency_id = target_agency_id
      and comment.created_at >= range_start
      and comment.created_at < range_end
      and task.archived_at is null
  ),
  recent_activity as (
    select activity.id, activity.client_id
    from public.activity_logs as activity
    join active_clients as client on client.id = activity.client_id
    where activity.agency_id = target_agency_id
      and activity.created_at >= range_start
      and activity.created_at < range_end
  ),
  client_metrics as (
    select
      client.id,
      client.name,
      (select count(*) from open_tasks where client_id = client.id)::integer as open_tasks,
      (select count(*) from completed_tasks where client_id = client.id)::integer as completed_tasks,
      (select count(*) from recent_activity where client_id = client.id)::integer as activity_count
    from active_clients as client
  ),
  assignee_metrics as (
    select
      member.user_id,
      coalesce(member.display_name, member.email, 'Member') as name,
      (select count(*) from open_tasks where assignee_id = member.user_id)::integer as open_tasks,
      (select count(*) from open_tasks where assignee_id = member.user_id and due_date < current_date)::integer as overdue_tasks,
      (select count(*) from completed_tasks where completed_assignee_id = member.user_id)::integer as completed_tasks,
      (select count(*) from recent_comments where author_id = member.user_id)::integer as comments_added
    from public.agency_members as member
    where member.agency_id = target_agency_id
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'open_tasks', (select count(*) from open_tasks),
      'overdue_tasks', (select count(*) from open_tasks where due_date < current_date),
      'completed_tasks', (select count(*) from completed_tasks),
      'comments_added', (select count(*) from recent_comments),
      'activity_count', (select count(*) from recent_activity)
    ),
    'clients', coalesce((select jsonb_agg(to_jsonb(client_metrics) order by open_tasks desc, name) from client_metrics), '[]'::jsonb),
    'assignees', coalesce((select jsonb_agg(to_jsonb(assignee_metrics) order by open_tasks desc, name) from assignee_metrics), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.is_agency_member(uuid) from public, anon;
revoke all on function public.is_agency_admin(uuid) from public, anon;
revoke all on function public.storage_path_agency_id(text) from public, anon;
revoke all on function public.move_task_tree_to_list(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.archive_task_tree(uuid, uuid, uuid, timestamptz) from public, anon;
revoke all on function public.restore_task_tree(uuid, uuid, uuid) from public, anon;
revoke all on function public.archive_client_workspace(uuid, uuid, timestamptz) from public, anon;
revoke all on function public.restore_client_workspace(uuid, uuid) from public, anon;
revoke all on function public.get_team_dashboard_metrics(uuid, timestamptz) from public, anon;
revoke all on function public.get_team_report_metrics(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.is_agency_member(uuid) to authenticated, service_role;
grant execute on function public.is_agency_admin(uuid) to authenticated, service_role;
grant execute on function public.storage_path_agency_id(text) to authenticated, service_role;
grant execute on function public.move_task_tree_to_list(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.archive_task_tree(uuid, uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.restore_task_tree(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.archive_client_workspace(uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.restore_client_workspace(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_team_dashboard_metrics(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.get_team_report_metrics(uuid, timestamptz, timestamptz) to authenticated, service_role;

alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;
alter table public.agency_ai_settings enable row level security;
alter table public.ai_team_reports enable row level security;
alter table public.clients enable row level security;
alter table public.task_lists enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_comment_attachments enable row level security;
alter table public.task_watchers enable row level security;
alter table public.notifications enable row level security;
alter table public.recurring_task_rules enable row level security;
alter table public.dossiers enable row level security;
alter table public.client_personas enable row level security;
alter table public.activity_logs enable row level security;
alter table public.onboarding_links enable row level security;
alter table public.onboarding_submissions enable row level security;
alter table public.creative_requests enable row level security;
alter table public.creative_request_comments enable row level security;
alter table public.external_creators enable row level security;
alter table public.creative_assignments enable row level security;

create policy "members can read agencies" on public.agencies for select using (public.is_agency_member(id));
create policy "admins can update agencies" on public.agencies for update using (public.is_agency_admin(id));

create policy "members can read agency members" on public.agency_members for select using (public.is_agency_member(agency_id));
create policy "admins can manage agency members" on public.agency_members for all using (public.is_agency_admin(agency_id)) with check (public.is_agency_admin(agency_id));
create policy "admins can read ai team reports" on public.ai_team_reports for select using (public.is_agency_admin(agency_id));
create policy "admins can create ai team reports" on public.ai_team_reports for insert with check (public.is_agency_admin(agency_id));
create policy "admins can delete ai team reports" on public.ai_team_reports for delete using (public.is_agency_admin(agency_id));

create policy "members can read clients" on public.clients for select using (public.is_agency_member(agency_id));
create policy "members can create clients" on public.clients for insert with check (
  public.is_agency_member(agency_id)
  and (
    public.is_agency_admin(agency_id)
    or (status <> 'archived' and archived_at is null and previous_status is null)
  )
);
create policy "members can update non-archived clients" on public.clients for update using (
  public.is_agency_member(agency_id)
  and (status <> 'archived' or public.is_agency_admin(agency_id))
) with check (
  public.is_agency_member(agency_id)
  and (
    public.is_agency_admin(agency_id)
    or (status <> 'archived' and archived_at is null and previous_status is null)
  )
);
create policy "admins can delete clients" on public.clients for delete using (
  public.is_agency_admin(agency_id) and status = 'archived'
);
create policy "members can manage task lists" on public.task_lists for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage tasks" on public.tasks for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage task comments" on public.task_comments for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage task comment attachments" on public.task_comment_attachments for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can read task watchers" on public.task_watchers for select using (public.is_agency_member(agency_id));
create policy "members can watch themselves" on public.task_watchers for insert with check (public.is_agency_member(agency_id) and user_id = auth.uid());
create policy "members can unwatch themselves" on public.task_watchers for delete using (public.is_agency_member(agency_id) and user_id = auth.uid());
create policy "members can create agency notifications" on public.notifications for insert with check (public.is_agency_member(agency_id));
create policy "recipients can read notifications" on public.notifications for select using (recipient_id = auth.uid() and public.is_agency_member(agency_id));
create policy "recipients can update notifications" on public.notifications for update using (recipient_id = auth.uid() and public.is_agency_member(agency_id)) with check (recipient_id = auth.uid() and public.is_agency_member(agency_id));
create policy "recipients can delete notifications" on public.notifications for delete using (recipient_id = auth.uid() and public.is_agency_member(agency_id));
create policy "members can manage recurring rules" on public.recurring_task_rules for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage dossiers" on public.dossiers for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage client personas" on public.client_personas for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can read activity" on public.activity_logs for select using (public.is_agency_member(agency_id));
create policy "members can add activity" on public.activity_logs for insert with check (public.is_agency_member(agency_id));
create policy "members can manage onboarding links" on public.onboarding_links for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage onboarding submissions" on public.onboarding_submissions for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage creative requests" on public.creative_requests for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage creative request comments" on public.creative_request_comments for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage external creators" on public.external_creators for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage creative assignments" on public.creative_assignments for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));

grant usage on schema public to authenticated, service_role;

revoke all on table
  public.agencies,
  public.agency_members,
  public.agency_ai_settings,
  public.ai_team_reports,
  public.clients,
  public.task_lists,
  public.tasks,
  public.task_comments,
  public.task_comment_attachments,
  public.task_watchers,
  public.notifications,
  public.recurring_task_rules,
  public.dossiers,
  public.client_personas,
  public.activity_logs,
  public.onboarding_links,
  public.onboarding_submissions,
  public.creative_requests,
  public.creative_request_comments,
  public.external_creators,
  public.creative_assignments
from public, anon;

revoke all on table public.agency_ai_settings from authenticated;
revoke all on table public.ai_team_reports from authenticated;

grant select, insert, update, delete on table
  public.agencies,
  public.agency_members,
  public.clients,
  public.task_lists,
  public.tasks,
  public.task_comments,
  public.task_comment_attachments,
  public.task_watchers,
  public.notifications,
  public.recurring_task_rules,
  public.dossiers,
  public.client_personas,
  public.activity_logs,
  public.onboarding_links,
  public.onboarding_submissions,
  public.creative_requests,
  public.creative_request_comments,
  public.external_creators,
  public.creative_assignments
to authenticated;

grant select, insert, delete on table public.ai_team_reports to authenticated;

grant all privileges on table
  public.agencies,
  public.agency_members,
  public.agency_ai_settings,
  public.ai_team_reports,
  public.clients,
  public.task_lists,
  public.tasks,
  public.task_comments,
  public.task_comment_attachments,
  public.task_watchers,
  public.notifications,
  public.recurring_task_rules,
  public.dossiers,
  public.client_personas,
  public.activity_logs,
  public.onboarding_links,
  public.onboarding_submissions,
  public.creative_requests,
  public.creative_request_comments,
  public.external_creators,
  public.creative_assignments
to service_role;

revoke all on sequence public.creative_requests_order_number_seq from public, anon;
grant usage, select on sequence public.creative_requests_order_number_seq to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('comment-attachments', 'comment-attachments', false, 104857600)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "agency members can read comment files" on storage.objects;
drop policy if exists "agency members can upload comment files" on storage.objects;
drop policy if exists "agency members can delete comment files" on storage.objects;

create policy "agency members can read comment files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'comment-attachments'
    and public.is_agency_member(public.storage_path_agency_id(name))
  );

create policy "agency members can upload comment files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comment-attachments'
    and public.is_agency_member(public.storage_path_agency_id(name))
  );

create policy "agency members can delete comment files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'comment-attachments'
    and public.is_agency_member(public.storage_path_agency_id(name))
  );

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index team_invitations_pending_email_key
  on public.team_invitations (lower(email))
  where accepted_at is null;

create index team_invitations_agency_idx
  on public.team_invitations (agency_id, created_at desc);

alter table public.team_invitations enable row level security;

create policy "admins can manage team invitations"
  on public.team_invitations
  for all
  using (public.is_agency_admin(agency_id))
  with check (public.is_agency_admin(agency_id));

revoke all on table public.team_invitations from public, anon;
grant select, insert, update, delete on table public.team_invitations to authenticated;
grant all privileges on table public.team_invitations to service_role;

-- Membership changes are sensitive and must pass through checked server
-- actions. Authenticated users retain read access through RLS, while the
-- server-only service role performs invitation acceptance and removals.
drop policy "admins can manage agency members" on public.agency_members;
revoke insert, update, delete on table public.agency_members from authenticated;

create or replace function public.provision_user_agency(
  target_user_id uuid,
  target_email text,
  invite_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  existing_agency_id uuid;
  invitation public.team_invitations%rowtype;
  new_agency_id uuid;
  new_agency_name text;
begin
  if target_user_id is null or nullif(trim(target_email), '') is null then
    raise exception 'Authenticated user ID and email are required.';
  end if;

  select agency_id
  into existing_agency_id
  from public.agency_members
  where user_id = target_user_id;

  if invite_token is not null then
    select *
    into invitation
    from public.team_invitations
    where token = invite_token
      and accepted_at is null
      and expires_at > now()
    for update;

    if not found or lower(invitation.email) <> lower(target_email) then
      raise exception 'This team invitation is invalid, expired, or belongs to another email.';
    end if;
  elsif existing_agency_id is null then
    select *
    into invitation
    from public.team_invitations
    where lower(email) = lower(target_email)
      and accepted_at is null
      and expires_at > now()
    order by created_at
    limit 1
    for update;
  end if;

  if invitation.id is not null then
    if existing_agency_id is not null and existing_agency_id <> invitation.agency_id then
      raise exception 'This user already belongs to another agency.';
    end if;

    if existing_agency_id is null then
      insert into public.agency_members (
        agency_id,
        user_id,
        role,
        display_name,
        email
      )
      values (
        invitation.agency_id,
        target_user_id,
        invitation.role,
        split_part(target_email, '@', 1),
        lower(target_email)
      );
    end if;

    update public.team_invitations
    set accepted_at = now()
    where id = invitation.id;

    return invitation.agency_id;
  end if;

  if existing_agency_id is not null then
    return existing_agency_id;
  end if;

  new_agency_name := initcap(replace(split_part(target_email, '@', 1), '.', ' ')) || '''s Agency';

  insert into public.agencies (name)
  values (new_agency_name)
  returning id into new_agency_id;

  insert into public.agency_members (
    agency_id,
    user_id,
    role,
    display_name,
    email
  )
  values (
    new_agency_id,
    target_user_id,
    'owner',
    split_part(target_email, '@', 1),
    lower(target_email)
  );

  return new_agency_id;
exception
  when unique_violation then
    select agency_id
    into existing_agency_id
    from public.agency_members
    where user_id = target_user_id;

    if existing_agency_id is not null then
      return existing_agency_id;
    end if;

    raise;
end;
$$;

revoke all on function public.provision_user_agency(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.provision_user_agency(uuid, text, uuid) to service_role;

commit;
