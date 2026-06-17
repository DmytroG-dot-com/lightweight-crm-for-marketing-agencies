begin;

alter table public.agency_ai_settings
  alter column model set default 'gpt-5.4-mini';

-- Move agencies that still use the former app default. Explicit custom models
-- remain unchanged.
update public.agency_ai_settings
set model = 'gpt-5.4-mini'
where model = 'gpt-5.5';

commit;
