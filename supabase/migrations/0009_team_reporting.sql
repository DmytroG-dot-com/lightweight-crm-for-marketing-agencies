begin;

alter table public.tasks
  add column if not exists completed_at timestamptz,
  add column if not exists completed_assignee_id uuid references auth.users(id) on delete set null;

update public.tasks
set completed_at = coalesce(completed_at, updated_at),
    completed_assignee_id = coalesce(completed_assignee_id, assignee_id)
where status = 'complete';

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

drop trigger if exists tasks_completion on public.tasks;
create trigger tasks_completion
  before insert or update of status on public.tasks
  for each row execute function public.set_task_completion();

create index if not exists tasks_agency_completed_idx
  on public.tasks(agency_id, completed_at desc)
  where completed_at is not null;
create index if not exists task_comments_agency_author_created_idx
  on public.task_comments(agency_id, author_id, created_at desc);
create index if not exists activity_logs_agency_created_idx
  on public.activity_logs(agency_id, created_at desc);

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

revoke all on function public.get_team_dashboard_metrics(uuid, timestamptz) from public, anon;
grant execute on function public.get_team_dashboard_metrics(uuid, timestamptz) to authenticated, service_role;

commit;
