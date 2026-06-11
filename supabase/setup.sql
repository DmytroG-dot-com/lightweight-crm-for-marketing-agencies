begin;

-- Destructive clean setup: removes only Agency Desk objects in the public
-- schema. Supabase Auth users in auth.users are not deleted.
drop table if exists
  public.creative_assignments,
  public.external_creators,
  public.creative_requests,
  public.onboarding_submissions,
  public.onboarding_links,
  public.activity_logs,
  public.dossiers,
  public.task_comment_attachments,
  public.task_comments,
  public.tasks,
  public.recurring_task_rules,
  public.task_lists,
  public.clients,
  public.team_invitations,
  public.agency_members,
  public.agencies
cascade;

drop function if exists public.provision_user_agency(uuid, text, uuid) cascade;
drop function if exists public.is_agency_admin(uuid) cascade;
drop function if exists public.is_agency_member(uuid) cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.storage_path_agency_id(text) cascade;

create extension if not exists pgcrypto;

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
  created_at timestamptz not null default now(),
  unique (agency_id, user_id),
  unique (user_id)
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
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null,
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
  archived_at timestamptz,
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
  active boolean not null default true,
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
  status text not null default 'draft' check (status in ('draft', 'ready', 'in_progress', 'review', 'launched', 'stopped')),
  hypothesis text not null,
  preferred_launch_date date not null default (current_date + 4),
  assets_needed integer not null default 1 check (assets_needed > 0),
  brief text,
  references_url text,
  ad_names text[] not null default '{}',
  comments text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
create unique index recurring_rules_id_agency_client_key on public.recurring_task_rules(id, agency_id, client_id);
create unique index onboarding_links_id_agency_client_key on public.onboarding_links(id, agency_id, client_id);
create unique index creative_requests_id_agency_key on public.creative_requests(id, agency_id);
create unique index external_creators_id_agency_key on public.external_creators(id, agency_id);

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
alter table public.recurring_task_rules add constraint recurring_rules_client_agency_fkey
  foreign key (client_id, agency_id) references public.clients(id, agency_id) on delete cascade;
alter table public.recurring_task_rules add constraint recurring_rules_list_agency_client_fkey
  foreign key (task_list_id, agency_id, client_id) references public.task_lists(id, agency_id, client_id);
alter table public.dossiers add constraint dossiers_client_agency_fkey
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
alter table public.creative_assignments add constraint creative_assignments_request_agency_fkey
  foreign key (creative_request_id, agency_id) references public.creative_requests(id, agency_id) on delete cascade;
alter table public.creative_assignments add constraint creative_assignments_creator_agency_fkey
  foreign key (creator_id, agency_id) references public.external_creators(id, agency_id) on delete cascade;

create index clients_agency_id_idx on public.clients(agency_id);
create index tasks_agency_assignee_idx on public.tasks(agency_id, assignee_id);
create index tasks_client_due_idx on public.tasks(client_id, due_date);
create index task_comment_attachments_comment_idx on public.task_comment_attachments(comment_id);
create index recurring_rules_due_idx on public.recurring_task_rules(active, next_run_at);
create index activity_logs_client_idx on public.activity_logs(client_id, created_at desc);
create index creative_requests_agency_idx on public.creative_requests(agency_id, preferred_launch_date);
create index creative_assignments_creator_idx on public.creative_assignments(creator_id, status);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger agencies_updated_at before update on public.agencies for each row execute function public.set_updated_at();
create trigger clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger recurring_rules_updated_at before update on public.recurring_task_rules for each row execute function public.set_updated_at();
create trigger dossiers_updated_at before update on public.dossiers for each row execute function public.set_updated_at();
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

revoke all on function public.is_agency_member(uuid) from public, anon;
revoke all on function public.is_agency_admin(uuid) from public, anon;
revoke all on function public.storage_path_agency_id(text) from public, anon;
grant execute on function public.is_agency_member(uuid) to authenticated, service_role;
grant execute on function public.is_agency_admin(uuid) to authenticated, service_role;
grant execute on function public.storage_path_agency_id(text) to authenticated, service_role;

alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;
alter table public.clients enable row level security;
alter table public.task_lists enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_comment_attachments enable row level security;
alter table public.recurring_task_rules enable row level security;
alter table public.dossiers enable row level security;
alter table public.activity_logs enable row level security;
alter table public.onboarding_links enable row level security;
alter table public.onboarding_submissions enable row level security;
alter table public.creative_requests enable row level security;
alter table public.external_creators enable row level security;
alter table public.creative_assignments enable row level security;

create policy "members can read agencies" on public.agencies for select using (public.is_agency_member(id));
create policy "admins can update agencies" on public.agencies for update using (public.is_agency_admin(id));

create policy "members can read agency members" on public.agency_members for select using (public.is_agency_member(agency_id));
create policy "admins can manage agency members" on public.agency_members for all using (public.is_agency_admin(agency_id)) with check (public.is_agency_admin(agency_id));

create policy "members can manage clients" on public.clients for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage task lists" on public.task_lists for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage tasks" on public.tasks for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage task comments" on public.task_comments for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage task comment attachments" on public.task_comment_attachments for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage recurring rules" on public.recurring_task_rules for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage dossiers" on public.dossiers for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can read activity" on public.activity_logs for select using (public.is_agency_member(agency_id));
create policy "members can add activity" on public.activity_logs for insert with check (public.is_agency_member(agency_id));
create policy "members can manage onboarding links" on public.onboarding_links for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage onboarding submissions" on public.onboarding_submissions for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage creative requests" on public.creative_requests for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage external creators" on public.external_creators for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));
create policy "members can manage creative assignments" on public.creative_assignments for all using (public.is_agency_member(agency_id)) with check (public.is_agency_member(agency_id));

grant usage on schema public to authenticated, service_role;

revoke all on table
  public.agencies,
  public.agency_members,
  public.clients,
  public.task_lists,
  public.tasks,
  public.task_comments,
  public.task_comment_attachments,
  public.recurring_task_rules,
  public.dossiers,
  public.activity_logs,
  public.onboarding_links,
  public.onboarding_submissions,
  public.creative_requests,
  public.external_creators,
  public.creative_assignments
from public, anon;

grant select, insert, update, delete on table
  public.agencies,
  public.agency_members,
  public.clients,
  public.task_lists,
  public.tasks,
  public.task_comments,
  public.task_comment_attachments,
  public.recurring_task_rules,
  public.dossiers,
  public.activity_logs,
  public.onboarding_links,
  public.onboarding_submissions,
  public.creative_requests,
  public.external_creators,
  public.creative_assignments
to authenticated;

grant all privileges on table
  public.agencies,
  public.agency_members,
  public.clients,
  public.task_lists,
  public.tasks,
  public.task_comments,
  public.task_comment_attachments,
  public.recurring_task_rules,
  public.dossiers,
  public.activity_logs,
  public.onboarding_links,
  public.onboarding_submissions,
  public.creative_requests,
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
