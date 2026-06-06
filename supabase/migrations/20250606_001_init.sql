-- Users (extends auth.users)
create table public.users (
  id          uuid primary key references auth.users on delete cascade,
  plan        text not null default 'free',
  created_at  timestamptz default now()
);
alter table public.users enable row level security;
create policy "Users can read own data" on public.users for select using (auth.uid() = id);
create policy "Users can update own data" on public.users for update using (auth.uid() = id);

-- Auto-create user row on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Cards
create table public.cards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users on delete cascade,
  language        text not null,
  word            text not null,
  pos             text,
  definition      text,
  patterns        jsonb default '[]',
  status          text not null default 'new',
  interval_days   float not null default 1,
  ease_factor     float not null default 2.5,
  next_review_at  date not null default current_date,
  created_at      timestamptz default now()
);
alter table public.cards enable row level security;
create policy "Users manage own cards" on public.cards for all using (auth.uid() = user_id);
create index cards_user_review on public.cards (user_id, next_review_at);

-- Reviews
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.cards on delete cascade,
  user_id      uuid not null references public.users on delete cascade,
  rating       text not null,
  reviewed_at  timestamptz default now()
);
alter table public.reviews enable row level security;
create policy "Users manage own reviews" on public.reviews for all using (auth.uid() = user_id);
