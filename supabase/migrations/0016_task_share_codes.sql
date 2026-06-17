begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.generate_short_code(code_length integer default 10)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  alphabet_length integer := length(alphabet);
  bytes bytea;
  result text := '';
  idx integer;
begin
  if code_length < 8 then
    raise exception 'Short codes must be at least 8 characters.';
  end if;

  bytes := extensions.gen_random_bytes(code_length);

  for idx in 0..code_length - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, idx) % alphabet_length) + 1, 1);
  end loop;

  return result;
end;
$$;

create or replace function public.generate_unique_task_share_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := public.generate_short_code(10);
    exit when not exists (
      select 1
      from public.tasks
      where share_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

alter table public.tasks
  add column if not exists share_code text;

update public.tasks
set share_code = public.generate_unique_task_share_code()
where share_code is null;

alter table public.tasks
  alter column share_code set default public.generate_unique_task_share_code(),
  alter column share_code set not null;

create unique index if not exists tasks_share_code_key
  on public.tasks(share_code);

commit;
