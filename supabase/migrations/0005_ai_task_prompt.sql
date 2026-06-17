begin;

alter table public.agency_ai_settings
  add column if not exists task_prompt text;

commit;
