drop policy if exists "members can manage tasks" on public.tasks;
drop policy if exists "members can read tasks" on public.tasks;
drop policy if exists "members can create tasks" on public.tasks;
drop policy if exists "members can update tasks" on public.tasks;
drop policy if exists "members can delete own tasks or admins can delete any task" on public.tasks;

create policy "members can read tasks"
  on public.tasks
  for select
  using (public.is_agency_member(agency_id));

create policy "members can create tasks"
  on public.tasks
  for insert
  with check (public.is_agency_member(agency_id));

create policy "members can update tasks"
  on public.tasks
  for update
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

create policy "members can delete own tasks or admins can delete any task"
  on public.tasks
  for delete
  using (
    public.is_agency_member(agency_id)
    and (
      public.is_agency_admin(agency_id)
      or created_by = auth.uid()
    )
  );
