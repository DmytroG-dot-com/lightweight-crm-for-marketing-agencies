begin;

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

create index ai_team_reports_agency_created_idx
  on public.ai_team_reports(agency_id, created_at desc);

alter table public.ai_team_reports enable row level security;

create policy "admins can read ai team reports"
  on public.ai_team_reports for select
  using (public.is_agency_admin(agency_id));
create policy "admins can create ai team reports"
  on public.ai_team_reports for insert
  with check (public.is_agency_admin(agency_id));
create policy "admins can delete ai team reports"
  on public.ai_team_reports for delete
  using (public.is_agency_admin(agency_id));

revoke all on table public.ai_team_reports from public, anon;
grant select, insert, delete on table public.ai_team_reports to authenticated;
grant all privileges on table public.ai_team_reports to service_role;

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

revoke all on function public.get_team_report_metrics(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_team_report_metrics(uuid, timestamptz, timestamptz) to authenticated, service_role;

commit;
