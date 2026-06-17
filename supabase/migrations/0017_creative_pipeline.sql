begin;

alter table public.creative_requests
  add column if not exists title text,
  add column if not exists due_date date,
  add column if not exists creator_id uuid,
  add column if not exists source_task_id uuid,
  add column if not exists notes text,
  add column if not exists completed_drive_folder_url text,
  add column if not exists submitted_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_client_at timestamptz;

update public.creative_requests
set due_date = coalesce(due_date, preferred_launch_date, current_date + 4),
    notes = coalesce(notes, comments),
    title = coalesce(nullif(btrim(title), ''), left(hypothesis, 160))
where due_date is null
   or notes is null
   or title is null
   or btrim(title) = '';

update public.creative_requests as request
set creator_id = assignment.creator_id
from (
  select distinct on (creative_request_id, agency_id)
    creative_request_id,
    agency_id,
    creator_id
  from public.creative_assignments
  order by creative_request_id, agency_id, assigned_at asc
) as assignment
where request.id = assignment.creative_request_id
  and request.agency_id = assignment.agency_id
  and request.creator_id is null;

update public.creative_requests as request
set completed_drive_folder_url = assignment.completed_drive_folder_url,
    submitted_at = coalesce(assignment.submitted_at, request.submitted_at)
from (
  select distinct on (creative_request_id, agency_id)
    creative_request_id,
    agency_id,
    completed_drive_folder_url,
    submitted_at
  from public.creative_assignments
  where completed_drive_folder_url is not null
  order by creative_request_id, agency_id, submitted_at desc nulls last, assigned_at desc
) as assignment
where request.id = assignment.creative_request_id
  and request.agency_id = assignment.agency_id
  and request.completed_drive_folder_url is null;

update public.creative_requests as request
set archived_at = coalesce(request.archived_at, client.archived_at),
    archived_by_client_at = client.archived_at
from public.clients as client
where request.client_id = client.id
  and request.agency_id = client.agency_id
  and client.status = 'archived'
  and client.archived_at is not null
  and request.archived_by_client_at is null;

update public.creative_requests
set status = 'assigned'
where creator_id is not null
  and status in ('draft', 'ready');

alter table public.creative_requests
  alter column due_date set not null,
  alter column title set not null;

alter table public.creative_requests
  drop constraint if exists creative_requests_status_check;

alter table public.creative_requests
  add constraint creative_requests_status_check
  check (status in ('draft', 'ready', 'assigned', 'in_progress', 'review', 'approved', 'launched', 'stopped'));

alter table public.creative_requests
  drop constraint if exists creative_requests_creator_agency_fkey;
alter table public.creative_requests
  add constraint creative_requests_creator_agency_fkey
  foreign key (creator_id, agency_id) references public.external_creators(id, agency_id) on delete set null;

alter table public.creative_requests
  drop constraint if exists creative_requests_source_task_agency_client_fkey;
alter table public.creative_requests
  add constraint creative_requests_source_task_agency_client_fkey
  foreign key (source_task_id, agency_id, client_id) references public.tasks(id, agency_id, client_id) on delete set null;

create index if not exists creative_requests_agency_due_idx
  on public.creative_requests(agency_id, due_date)
  where archived_at is null;

create index if not exists creative_requests_agency_creator_idx
  on public.creative_requests(agency_id, creator_id, status, due_date)
  where creator_id is not null and archived_at is null;

create index if not exists creative_requests_agency_source_task_idx
  on public.creative_requests(agency_id, source_task_id)
  where source_task_id is not null and archived_at is null;

create index if not exists creative_requests_agency_archived_idx
  on public.creative_requests(agency_id, archived_at desc)
  where archived_at is not null;

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

commit;
