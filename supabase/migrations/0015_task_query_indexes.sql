begin;

create index if not exists tasks_agency_client_list_open_due_idx
  on public.tasks(agency_id, client_id, task_list_id, due_date)
  where archived_at is null;

create index if not exists tasks_agency_assignee_open_due_idx
  on public.tasks(agency_id, assignee_id, due_date)
  where archived_at is null;

create index if not exists tasks_agency_open_due_idx
  on public.tasks(agency_id, due_date)
  where archived_at is null and status <> 'complete';

create index if not exists task_comments_task_created_idx
  on public.task_comments(task_id, created_at);

commit;
