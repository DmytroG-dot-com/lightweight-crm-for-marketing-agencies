begin;

alter table public.recurring_task_rules
  add column if not exists generation_mode text;

update public.recurring_task_rules
set generation_mode = 'generate_task'
where generation_mode is null;

alter table public.recurring_task_rules
  alter column generation_mode set default 'reset_task',
  alter column generation_mode set not null;

alter table public.recurring_task_rules
  drop constraint if exists recurring_task_rules_generation_mode_check;

alter table public.recurring_task_rules
  add constraint recurring_task_rules_generation_mode_check
  check (generation_mode in ('generate_task', 'reset_task'));

create table if not exists public.recurring_task_runs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  recurring_rule_id uuid references public.recurring_task_rules(id) on delete set null,
  task_list_id uuid references public.task_lists(id) on delete set null,
  title text not null,
  occurrence_date date not null,
  start_date date,
  due_date date,
  completed_at timestamptz not null default now(),
  completed_assignee_id uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists recurring_task_runs_task_occurrence_key
  on public.recurring_task_runs(task_id, occurrence_date);

create index if not exists recurring_task_runs_agency_completed_idx
  on public.recurring_task_runs(agency_id, completed_at desc);

create index if not exists recurring_task_runs_assignee_completed_idx
  on public.recurring_task_runs(agency_id, completed_assignee_id, completed_at desc);

create index if not exists recurring_task_runs_client_completed_idx
  on public.recurring_task_runs(agency_id, client_id, completed_at desc);

create or replace function public.recurring_move_to_weekday(input_date date)
returns date
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  normalized date := input_date;
begin
  if extract(isodow from normalized) = 6 then
    normalized := normalized + 2;
  elsif extract(isodow from normalized) = 7 then
    normalized := normalized + 1;
  end if;

  return normalized;
end;
$$;

create or replace function public.advance_recurring_schedule_date(
  input_date date,
  input_frequency text,
  input_interval_count integer,
  input_skip_weekends boolean
)
returns date
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  next_date date;
  month_anchor date;
  last_day date;
  target_day integer;
begin
  if input_interval_count <= 0 then
    raise exception 'Recurring interval must be positive.';
  end if;

  if input_frequency = 'daily' then
    next_date := input_date + input_interval_count;
  elsif input_frequency = 'weekly' then
    next_date := input_date + (input_interval_count * 7);
  elsif input_frequency = 'monthly' then
    month_anchor := (date_trunc('month', input_date)::date + make_interval(months => input_interval_count))::date;
    last_day := (date_trunc('month', month_anchor)::date + interval '1 month - 1 day')::date;
    target_day := least(
      extract(day from input_date)::integer,
      extract(day from last_day)::integer
    );
    next_date := make_date(
      extract(year from month_anchor)::integer,
      extract(month from month_anchor)::integer,
      target_day
    );
  else
    raise exception 'Unsupported recurring frequency: %', input_frequency;
  end if;

  if input_skip_weekends then
    next_date := public.recurring_move_to_weekday(next_date);
  end if;

  return next_date;
end;
$$;

create or replace function public.complete_recurring_task_run(
  target_agency_id uuid,
  target_client_id uuid,
  target_task_id uuid,
  actor_user_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  task_row record;
  rule_row record;
  completed_timestamp timestamptz := now();
  completed_date date := now()::date;
  current_occurrence date;
  next_occurrence date;
  next_due date;
  following_run date;
  run_id uuid;
begin
  if not public.is_agency_member(target_agency_id) then
    raise exception 'Agency membership is required.';
  end if;

  select
    task.id,
    task.title,
    task.status,
    task.assignee_id,
    task.task_list_id,
    task.source_recurring_rule_id,
    task.occurrence_date,
    task.start_date,
    task.due_date
  into task_row
  from public.tasks as task
  where task.id = target_task_id
    and task.agency_id = target_agency_id
    and task.client_id = target_client_id
    and task.archived_at is null
  for update;

  if not found then
    raise exception 'Task not found.';
  end if;

  if task_row.source_recurring_rule_id is null then
    raise exception 'Task is not recurring.';
  end if;

  if task_row.status = 'complete' then
    raise exception 'Recurring task is already complete.';
  end if;

  select
    rule.id,
    rule.frequency,
    rule.interval_count,
    rule.next_run_at,
    rule.due_offset_days,
    rule.skip_weekends,
    rule.active,
    rule.generation_mode
  into rule_row
  from public.recurring_task_rules as rule
  where rule.id = task_row.source_recurring_rule_id
    and rule.agency_id = target_agency_id
    and rule.client_id = target_client_id
  for update;

  if not found then
    raise exception 'Recurring rule not found.';
  end if;

  if rule_row.generation_mode <> 'reset_task' then
    raise exception 'This recurring task uses the legacy schedule model.';
  end if;

  if not rule_row.active then
    raise exception 'Recurring task is paused.';
  end if;

  current_occurrence := coalesce(task_row.occurrence_date, task_row.start_date, task_row.due_date, rule_row.next_run_at);

  insert into public.recurring_task_runs (
    agency_id,
    client_id,
    task_id,
    recurring_rule_id,
    task_list_id,
    title,
    occurrence_date,
    start_date,
    due_date,
    completed_at,
    completed_assignee_id,
    completed_by
  )
  values (
    target_agency_id,
    target_client_id,
    task_row.id,
    task_row.source_recurring_rule_id,
    task_row.task_list_id,
    task_row.title,
    current_occurrence,
    task_row.start_date,
    task_row.due_date,
    completed_timestamp,
    task_row.assignee_id,
    actor_user_id
  )
  returning id into run_id;

  next_occurrence := rule_row.next_run_at;
  while next_occurrence <= completed_date loop
    next_occurrence := public.advance_recurring_schedule_date(
      next_occurrence,
      rule_row.frequency,
      rule_row.interval_count,
      rule_row.skip_weekends
    );
  end loop;

  next_due := next_occurrence + rule_row.due_offset_days;
  if rule_row.skip_weekends then
    next_due := public.recurring_move_to_weekday(next_due);
  end if;

  following_run := public.advance_recurring_schedule_date(
    next_occurrence,
    rule_row.frequency,
    rule_row.interval_count,
    rule_row.skip_weekends
  );

  update public.tasks
  set
    status = 'todo',
    occurrence_date = next_occurrence,
    start_date = next_occurrence,
    due_date = next_due,
    completed_at = null,
    completed_assignee_id = null
  where id = task_row.id
    and agency_id = target_agency_id
    and client_id = target_client_id;

  update public.recurring_task_rules
  set next_run_at = following_run
  where id = rule_row.id
    and agency_id = target_agency_id
    and client_id = target_client_id;

  return jsonb_build_object(
    'run_id', run_id,
    'task_id', task_row.id,
    'title', task_row.title,
    'task_list_id', task_row.task_list_id,
    'completed_at', completed_timestamp,
    'next_start_date', next_occurrence,
    'next_due_date', next_due,
    'next_run_at', following_run
  );
end;
$$;

create or replace function public.prevent_direct_reset_recurring_completion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  recurring_mode text;
begin
  if new.source_recurring_rule_id is null or new.status <> 'complete' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'complete' then
    return new;
  end if;

  select generation_mode
  into recurring_mode
  from public.recurring_task_rules
  where id = new.source_recurring_rule_id;

  if recurring_mode = 'reset_task' then
    raise exception 'Reset-style recurring tasks must be completed through the app workflow.';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_direct_recurring_completion_guard on public.tasks;
create trigger tasks_direct_recurring_completion_guard
  before insert or update of status on public.tasks
  for each row execute function public.prevent_direct_reset_recurring_completion();

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

    union all

    select recurring_run.id, recurring_run.client_id, recurring_run.completed_assignee_id
    from public.recurring_task_runs as recurring_run
    join active_clients as client on client.id = recurring_run.client_id
    where recurring_run.agency_id = target_agency_id
      and recurring_run.completed_at >= range_start
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

    union all

    select recurring_run.id, recurring_run.client_id, recurring_run.completed_assignee_id
    from public.recurring_task_runs as recurring_run
    join active_clients as client on client.id = recurring_run.client_id
    where recurring_run.agency_id = target_agency_id
      and recurring_run.completed_at >= range_start
      and recurring_run.completed_at < range_end
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

revoke all on function public.recurring_move_to_weekday(date) from public, anon;
revoke all on function public.advance_recurring_schedule_date(date, text, integer, boolean) from public, anon;
revoke all on function public.complete_recurring_task_run(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.recurring_move_to_weekday(date) to authenticated, service_role;
grant execute on function public.advance_recurring_schedule_date(date, text, integer, boolean) to authenticated, service_role;
grant execute on function public.complete_recurring_task_run(uuid, uuid, uuid, uuid) to authenticated, service_role;

alter table public.recurring_task_runs enable row level security;

drop policy if exists "members can read recurring task runs" on public.recurring_task_runs;
create policy "members can read recurring task runs"
  on public.recurring_task_runs
  for select
  using (public.is_agency_member(agency_id));

drop policy if exists "members can add recurring task runs" on public.recurring_task_runs;
create policy "members can add recurring task runs"
  on public.recurring_task_runs
  for insert
  with check (public.is_agency_member(agency_id));

revoke all on table public.recurring_task_runs from public, anon;
grant select, insert on table public.recurring_task_runs to authenticated;
grant all privileges on table public.recurring_task_runs to service_role;

commit;
