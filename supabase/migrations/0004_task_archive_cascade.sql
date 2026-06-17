begin;

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

revoke all on function public.archive_task_tree(uuid, uuid, uuid, timestamptz) from public, anon;
revoke all on function public.restore_task_tree(uuid, uuid, uuid) from public, anon;
grant execute on function public.archive_task_tree(uuid, uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.restore_task_tree(uuid, uuid, uuid) to authenticated, service_role;

commit;
