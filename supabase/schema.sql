-- GIGGARI 4.0: one table holds every song, setlist and tag of every user.
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run.
-- Safe to run again: it only creates what is missing and replaces the functions.

create table if not exists public.records (
  owner      uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text    not null check (kind in ('songs', 'setlists', 'tags')),
  id         text    not null,
  data       jsonb   not null,
  updated_at bigint  not null default 0,          -- the app's own edit time (ms); the newer one wins
  deleted    boolean not null default false,       -- deleted for good, kept so other devices learn of it
  seq        bigint  not null default 0,           -- change counter; devices fetch what is newer than they have seen
  server_at  timestamptz not null default now(),
  primary key (owner, kind, id)
);

create sequence if not exists public.records_seq;
create index if not exists records_owner_seq on public.records (owner, seq);

-- Every insert and update gets a new change number.
create or replace function public.records_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.seq := nextval('public.records_seq');
  new.server_at := now();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

-- Row Level Security: each user sees and changes only their own rows.
alter table public.records enable row level security;

drop policy if exists "records: read own" on public.records;
drop policy if exists "records: insert own" on public.records;
drop policy if exists "records: update own" on public.records;
drop policy if exists "records: delete own" on public.records;
create policy "records: read own"   on public.records for select to authenticated using (owner = (select auth.uid()));
create policy "records: insert own" on public.records for insert to authenticated with check (owner = (select auth.uid()));
create policy "records: update own" on public.records for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "records: delete own" on public.records for delete to authenticated using (owner = (select auth.uid()));

-- New tables are not exposed automatically in this project, so grant access explicitly.
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- Send many changes at once. A row is only overwritten by a newer edit, so an old device can not undo newer work.
create or replace function public.push_records(items jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  it jsonb;
  n  integer := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  for it in select * from jsonb_array_elements(items) loop
    insert into public.records as r (owner, kind, id, data, updated_at, deleted)
    values (auth.uid(), it->>'kind', it->>'id', it->'data', coalesce((it->>'updated_at')::bigint, 0), coalesce((it->>'deleted')::boolean, false))
    on conflict (owner, kind, id) do update
      set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
      where r.updated_at < excluded.updated_at;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.push_records(jsonb) from public, anon;
grant execute on function public.push_records(jsonb) to authenticated;
