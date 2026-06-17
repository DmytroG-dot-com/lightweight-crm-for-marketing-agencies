begin;

alter table public.agency_members
  add column if not exists timezone text not null default 'America/New_York',
  add column if not exists timezone_auto boolean not null default true;

commit;
