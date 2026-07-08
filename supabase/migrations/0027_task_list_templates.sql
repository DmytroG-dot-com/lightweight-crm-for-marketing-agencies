alter table public.task_templates
  add column if not exists created_from_task_list_id uuid;

create unique index if not exists task_lists_id_agency_key
  on public.task_lists(id, agency_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_templates_source_list_agency_fkey'
  ) then
    alter table public.task_templates
      add constraint task_templates_source_list_agency_fkey
      foreign key (created_from_task_list_id, agency_id)
      references public.task_lists(id, agency_id)
      on delete set null;
  end if;
end $$;
