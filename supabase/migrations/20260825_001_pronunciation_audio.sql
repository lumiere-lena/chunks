-- Pronunciation audio for dictionary entries.
-- The mp3 itself lives in Storage; `audio_path` is the object key inside the
-- `pronunciations` bucket. Null means "not synthesized yet".
alter table public.dictionary add column audio_path text;

-- Public bucket: the browser fetches the mp3 directly, so the audio never has
-- to travel through an Edge Function. Only the service role writes to it,
-- and service-role requests bypass RLS — no extra policies needed.
insert into storage.buckets (id, name, public)
values ('pronunciations', 'pronunciations', true)
on conflict (id) do nothing;
