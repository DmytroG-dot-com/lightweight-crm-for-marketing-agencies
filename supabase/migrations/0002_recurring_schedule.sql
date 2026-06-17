begin;

alter table public.recurring_task_rules
  add column if not exists due_offset_days integer not null default 0,
  add column if not exists skip_weekends boolean not null default false;

alter table public.recurring_task_rules
  drop constraint if exists recurring_task_rules_due_offset_days_check;

alter table public.recurring_task_rules
  add constraint recurring_task_rules_due_offset_days_check
  check (due_offset_days >= 0);

commit;
