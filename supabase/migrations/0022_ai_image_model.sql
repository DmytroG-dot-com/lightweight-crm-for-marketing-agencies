begin;

alter table public.agency_ai_settings
  add column if not exists image_model text;

update public.agency_ai_settings
set image_model = coalesce(nullif(btrim(image_model), ''), 'gpt-image-1')
where image_model is null
   or btrim(image_model) = '';

alter table public.agency_ai_settings
  alter column image_model set default 'gpt-image-1';

commit;
