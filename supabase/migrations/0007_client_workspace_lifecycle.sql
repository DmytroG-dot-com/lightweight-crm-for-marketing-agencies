begin;

alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists previous_status text check (previous_status in ('active', 'paused'));

alter table public.tasks
  add column if not exists archived_by_client_at timestamptz;

alter table public.task_lists
  add column if not exists archived_by_client_at timestamptz;

alter table public.recurring_task_rules
  add column if not exists paused_by_client_at timestamptz,
  add column if not exists was_active_before_client_archive boolean;

alter table public.onboarding_links
  add column if not exists archived_by_client_at timestamptz,
  add column if not exists was_active_before_client_archive boolean;

create index if not exists clients_agency_status_idx
  on public.clients(agency_id, status);
create index if not exists task_lists_agency_client_idx
  on public.task_lists(agency_id, client_id);
create index if not exists recurring_rules_agency_client_idx
  on public.recurring_task_rules(agency_id, client_id);
create index if not exists onboarding_links_agency_client_idx
  on public.onboarding_links(agency_id, client_id);

-- Bring clients archived before this migration into the same reversible model.
update public.clients
set archived_at = coalesce(archived_at, updated_at, now()),
    previous_status = coalesce(previous_status, 'active')
where status = 'archived';

update public.tasks as task
set archived_at = client.archived_at,
    archived_by_client_at = client.archived_at
from public.clients as client
where task.client_id = client.id
  and task.agency_id = client.agency_id
  and client.status = 'archived'
  and task.archived_at is null;

update public.task_lists as list
set archived_at = client.archived_at,
    archived_by_client_at = client.archived_at
from public.clients as client
where list.client_id = client.id
  and list.agency_id = client.agency_id
  and client.status = 'archived'
  and list.archived_at is null;

update public.recurring_task_rules as rule
set active = false,
    paused_by_client_at = client.archived_at,
    was_active_before_client_archive = rule.active
from public.clients as client
where rule.client_id = client.id
  and rule.agency_id = client.agency_id
  and client.status = 'archived'
  and rule.paused_by_client_at is null;

update public.onboarding_links as link
set active = false,
    archived_by_client_at = client.archived_at,
    was_active_before_client_archive = link.active
from public.clients as client
where link.client_id = client.id
  and link.agency_id = client.agency_id
  and client.status = 'archived'
  and link.archived_by_client_at is null;

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

  update public.clients
  set previous_status = client_status,
      status = 'archived',
      archived_at = target_archived_at
  where id = target_client_id and agency_id = target_agency_id;

  return jsonb_build_object(
    'tasks', task_count,
    'task_lists', list_count,
    'recurring_rules', rule_count,
    'onboarding_links', link_count
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
    'status', restore_status
  );
end;
$$;

drop policy if exists "members can manage clients" on public.clients;
drop policy if exists "members can read clients" on public.clients;
drop policy if exists "members can create clients" on public.clients;
drop policy if exists "members can update non-archived clients" on public.clients;
drop policy if exists "admins can delete clients" on public.clients;

create policy "members can read clients"
  on public.clients for select
  using (public.is_agency_member(agency_id));

create policy "members can create clients"
  on public.clients for insert
  with check (
    public.is_agency_member(agency_id)
    and (
      public.is_agency_admin(agency_id)
      or (status <> 'archived' and archived_at is null and previous_status is null)
    )
  );

create policy "members can update non-archived clients"
  on public.clients for update
  using (
    public.is_agency_member(agency_id)
    and (status <> 'archived' or public.is_agency_admin(agency_id))
  )
  with check (
    public.is_agency_member(agency_id)
    and (
      public.is_agency_admin(agency_id)
      or (status <> 'archived' and archived_at is null and previous_status is null)
    )
  );

create policy "admins can delete clients"
  on public.clients for delete
  using (public.is_agency_admin(agency_id) and status = 'archived');

revoke all on function public.archive_client_workspace(uuid, uuid, timestamptz) from public, anon;
revoke all on function public.restore_client_workspace(uuid, uuid) from public, anon;
grant execute on function public.archive_client_workspace(uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.restore_client_workspace(uuid, uuid) to authenticated, service_role;

commit;
