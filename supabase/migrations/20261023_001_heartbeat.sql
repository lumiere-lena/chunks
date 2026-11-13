-- Keep-alive heartbeat: a regular write so the free-tier project is not paused
-- for inactivity. Called by .github/workflows/keep-supabase-alive.yml.
create table public.heartbeat (
  id         int primary key default 1 check (id = 1),
  beat_at    timestamptz not null default now(),
  beat_count bigint not null default 0
);

-- No policies: nobody reads or writes the table directly
alter table public.heartbeat enable row level security;

create or replace function public.keep_alive()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  insert into public.heartbeat (id, beat_at, beat_count)
  values (1, now(), 1)
  on conflict (id) do update
    set beat_at = now(), beat_count = heartbeat.beat_count + 1
  returning beat_at;
$$;

revoke all on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon;
