create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  description text,
  created_from_task_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_template_items (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  template_id uuid not null,
  parent_item_id uuid,
  sort_order integer not null default 0,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'blocked', 'complete')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assignee_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists task_templates_id_agency_key
  on public.task_templates(id, agency_id);

create unique index if not exists task_template_items_id_agency_template_key
  on public.task_template_items(id, agency_id, template_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_templates_source_task_agency_fkey'
  ) then
    alter table public.task_templates
      add constraint task_templates_source_task_agency_fkey
      foreign key (created_from_task_id, agency_id)
      references public.tasks(id, agency_id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_template_items_template_agency_fkey'
  ) then
    alter table public.task_template_items
      add constraint task_template_items_template_agency_fkey
      foreign key (template_id, agency_id)
      references public.task_templates(id, agency_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_template_items_parent_agency_template_fkey'
  ) then
    alter table public.task_template_items
      add constraint task_template_items_parent_agency_template_fkey
      foreign key (parent_item_id, agency_id, template_id)
      references public.task_template_items(id, agency_id, template_id)
      on delete cascade;
  end if;
end $$;

create index if not exists task_templates_agency_created_idx
  on public.task_templates(agency_id, created_at desc);

create index if not exists task_template_items_template_sort_idx
  on public.task_template_items(template_id, sort_order, created_at);

drop trigger if exists task_templates_updated_at on public.task_templates;
create trigger task_templates_updated_at
  before update on public.task_templates
  for each row execute function public.set_updated_at();

alter table public.task_templates enable row level security;
alter table public.task_template_items enable row level security;

drop policy if exists "members can manage task templates" on public.task_templates;
create policy "members can manage task templates"
  on public.task_templates
  for all
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

drop policy if exists "members can manage task template items" on public.task_template_items;
create policy "members can manage task template items"
  on public.task_template_items
  for all
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

revoke all on table public.task_templates, public.task_template_items from public, anon;

grant select, insert, update, delete on table
  public.task_templates,
  public.task_template_items
to authenticated;

grant all privileges on table
  public.task_templates,
  public.task_template_items
to service_role;
