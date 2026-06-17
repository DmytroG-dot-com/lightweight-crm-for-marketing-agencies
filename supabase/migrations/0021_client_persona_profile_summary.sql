begin;

alter table public.client_personas
  add column if not exists profile_summary text;

update public.client_personas
set profile_summary = nullif(
  trim(
    concat_ws(
      '. ',
      nullif(btrim(name), ''),
      nullif(btrim(segment), ''),
      nullif(btrim(job_to_be_done), '')
    )
  ),
  ''
)
where profile_summary is null
   or btrim(profile_summary) = '';

commit;
