begin;

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

revoke all on function public.move_task_tree_to_list(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.move_task_tree_to_list(uuid, uuid, uuid, uuid) to authenticated, service_role;

commit;
