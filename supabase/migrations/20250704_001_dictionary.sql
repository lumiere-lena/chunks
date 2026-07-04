-- Shared dictionary cache: one AI-generated card per word+language
create table public.dictionary (
  id          uuid primary key default gen_random_uuid(),
  word        text not null,
  language    text not null,
  pos         text,
  definition  text,
  patterns    jsonb default '[]',
  model       text,
  created_at  timestamptz default now(),
  constraint dictionary_word_lang unique (word, language)
);

-- Everyone can read; only service-role (Edge Function) writes
alter table public.dictionary enable row level security;
create policy "Anyone can read dictionary" on public.dictionary for select using (true);
