-- Sources: videos, texts and speaking sessions that phrases come from.
--
-- Content is written by Claude in chat through the Supabase connector, with one
-- call to import_source(). The browser only reads sources and exercises, marks
-- cards as known and logs exercise attempts.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.sources (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users on delete cascade,
  language          text not null,
  kind              text not null check (kind in ('youtube', 'audio', 'text', 'speaking')),
  url               text,
  external_id       text,
  title             text,
  author            text,
  duration_s        int,
  -- Segments: [{ "t": 136, "end": 144, "text": "…" }], times in seconds
  transcript        jsonb,
  transcript_origin text check (transcript_origin in ('captions', 'stt', 'pasted')),
  audio_path        text,
  status            text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  meta              jsonb not null default '{}',
  created_at        timestamptz not null default now()
);
create index sources_user on public.sources (user_id, created_at desc);

-- A card keeps a link to the source it came from. Its quote from the source is
-- the first entry of `patterns`, so no separate context column is needed.
alter table public.cards
  add column source_id         uuid references public.sources on delete set null,
  add column context_ts        numeric,      -- seconds into the source, null for text
  add column my_attempt        text,         -- speaking: what I actually said
  add column used_in_speech_at timestamptz;  -- last time it came up in my own speech
create index cards_source on public.cards (source_id) where source_id is not null;

-- status gains 'known': the phrase is already mine, never study it.
-- (status has no check constraint; the values are new / learning / mastered / known.)

create table public.exercises (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users on delete cascade,
  source_id  uuid not null references public.sources on delete cascade,
  card_id    uuid not null references public.cards on delete cascade,
  kind       text not null check (kind in ('gap_source', 'gap_new')),
  sentence   text not null,            -- exactly one ___
  answers    jsonb not null,           -- every accepted answer, ["reach for", "reached for"]
  ts         numeric,
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index exercises_source on public.exercises (source_id, position);

create table public.exercise_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users on delete cascade,
  exercise_id uuid not null references public.exercises on delete cascade,
  answer      text not null,
  correct     boolean not null,
  hinted      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index exercise_attempts_exercise on public.exercise_attempts (exercise_id);

create table public.speaking_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users on delete cascade,
  language        text not null,
  -- Null for past sessions loaded from log blocks, which have no transcript
  source_id       uuid unique references public.sources on delete set null,
  date            date not null,
  type            text not null check (type in ('monologue', '4-3-2')),
  minutes         numeric,
  wpm             numeric,
  gaps_per_10     numeric,
  restarts        int,
  ru_drops        int,
  fillers_per_min numeric,
  chunks_reused   int,
  top_pattern     text,
  note            text,
  created_at      timestamptz not null default now()
);
create index speaking_sessions_user on public.speaking_sessions (user_id, date);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Owners read their own rows. Only import_source() writes sources, exercises
-- and sessions; the browser may add attempts to its own exercises.

alter table public.sources           enable row level security;
alter table public.exercises         enable row level security;
alter table public.exercise_attempts enable row level security;
alter table public.speaking_sessions enable row level security;

create policy "Users read own sources"   on public.sources           for select using (auth.uid() = user_id);
create policy "Users read own exercises" on public.exercises         for select using (auth.uid() = user_id);
create policy "Users read own sessions"  on public.speaking_sessions for select using (auth.uid() = user_id);
create policy "Users read own attempts"  on public.exercise_attempts for select using (auth.uid() = user_id);
create policy "Users log own attempts"   on public.exercise_attempts for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.exercises e where e.id = exercise_id and e.user_id = auth.uid())
);

-- ── import_source(payload) ──────────────────────────────────────────────────
-- One transaction: source + cards + exercises (+ speaking session).
--
-- Malformed data rolls everything back. A phrase that is already a card is
-- skipped quietly together with its exercises and reported back, so one missed
-- duplicate never costs the other fourteen phrases.
--
-- Returns { source_id, path, cards_created, skipped, refreshed,
--           exercises_created, exercises_dropped, used_in_speech, speaking_session_id }.

create or replace function public.import_source(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid;
  v_lang      text := coalesce(nullif(payload->>'language', ''), 'en');
  v_src       jsonb := payload->'source';
  v_speak     jsonb := payload->'speaking';
  v_phrases   jsonb := coalesce(payload->'phrases', '[]'::jsonb);
  v_exercises jsonb := coalesce(payload->'exercises', '[]'::jsonb);
  v_used      jsonb := coalesce(payload->'used_in_speech', '[]'::jsonb);
  v_is_speak  boolean;
  v_source_id uuid;
  v_session   uuid;
  v_date      date;
  v_item      jsonb;
  v_head      text;
  v_card      record;
  v_card_id   uuid;
  v_names     text[] := '{}';
  v_map       jsonb := '{}'::jsonb;   -- headword → new card id
  v_skipped   jsonb := '[]'::jsonb;
  v_refreshed jsonb := '[]'::jsonb;
  v_marked    jsonb := '[]'::jsonb;
  v_created   int := 0;
  v_ex_made   int := 0;
  v_ex_drop   int := 0;
  v_pos       int := 0;
  v_s         text;
begin
  -- ── Validate ──────────────────────────────────────────────────────────────
  begin
    v_user := (payload->>'user_id')::uuid;
  exception when others then
    raise exception 'user_id is not a uuid';
  end;
  if v_user is null or not exists (select 1 from users where id = v_user) then
    raise exception 'unknown user_id';
  end if;
  if v_src is null and v_speak is null then
    raise exception 'payload needs "source" or "speaking"';
  end if;
  if v_src is null and (jsonb_array_length(v_phrases) > 0 or jsonb_array_length(v_exercises) > 0) then
    raise exception 'phrases and exercises need a "source"';
  end if;
  if v_src is not null and coalesce(v_src->>'kind', '') not in ('youtube', 'audio', 'text', 'speaking') then
    raise exception 'source.kind must be youtube, audio, text or speaking';
  end if;
  v_is_speak := v_speak is not null or v_src->>'kind' = 'speaking';

  for v_item in select * from jsonb_array_elements(v_phrases) loop
    v_head := lower(btrim(v_item->>'phrase'));
    if coalesce(v_head, '') = '' then
      raise exception 'phrase without "phrase": %', v_item;
    end if;
    if coalesce(btrim(v_item->>'definition'), '') = '' then
      raise exception 'phrase "%" has no definition', v_head;
    end if;
    if jsonb_typeof(v_item->'patterns') <> 'array' or jsonb_array_length(v_item->'patterns') = 0 then
      raise exception 'phrase "%" has no patterns', v_head;
    end if;
    if (v_item->'patterns'->>0) !~ '<<[^>]+>>' then
      raise exception 'phrase "%": the first pattern (the quote) must mark the phrase with <<…>>', v_head;
    end if;
    if v_head = any(v_names) then
      raise exception 'phrase "%" is listed twice', v_head;
    end if;
    v_names := v_names || v_head;
  end loop;

  for v_item in select * from jsonb_array_elements(v_exercises) loop
    v_s := v_item->>'sentence';
    if coalesce(v_item->>'kind', '') not in ('gap_source', 'gap_new') then
      raise exception 'exercise kind must be gap_source or gap_new: %', v_item;
    end if;
    if v_s is null or (select count(*) from regexp_matches(v_s, '_{3,}', 'g')) <> 1 then
      raise exception 'exercise sentence needs exactly one ___: %', v_s;
    end if;
    if jsonb_typeof(v_item->'answers') <> 'array' or jsonb_array_length(v_item->'answers') = 0
       or exists (select 1 from jsonb_array_elements_text(v_item->'answers') a where btrim(a) = '') then
      raise exception 'exercise needs non-empty answers: %', v_s;
    end if;
    if not (lower(btrim(v_item->>'phrase')) = any(v_names)) then
      raise exception 'exercise refers to a phrase that is not in "phrases": %', v_item->>'phrase';
    end if;
  end loop;

  if v_speak is not null and coalesce(v_speak->>'type', '') not in ('monologue', '4-3-2') then
    raise exception 'speaking.type must be monologue or 4-3-2';
  end if;

  -- ── Source ────────────────────────────────────────────────────────────────
  if v_src is not null then
    insert into sources (user_id, language, kind, url, external_id, title, author,
                         duration_s, transcript, transcript_origin, audio_path, meta)
    values (
      v_user, v_lang, v_src->>'kind', v_src->>'url',
      coalesce(v_src->>'external_id',
               case when v_src->>'kind' = 'youtube'
                    then substring(v_src->>'url' from '(?:v=|youtu\.be/|shorts/)([A-Za-z0-9_-]{11})') end),
      v_src->>'title', v_src->>'author',
      (v_src->>'duration_s')::int,
      v_src->'transcript',
      coalesce(v_src->>'transcript_origin',
               case when v_src->>'kind' = 'youtube' and v_src->'transcript' is not null then 'captions'
                    when v_src->'transcript' is not null then 'pasted' end),
      v_src->>'audio_path',
      coalesce(v_src->'meta', '{}'::jsonb)
    )
    returning id into v_source_id;
  end if;

  -- ── Cards ─────────────────────────────────────────────────────────────────
  for v_item in select * from jsonb_array_elements(v_phrases) loop
    v_head := lower(btrim(v_item->>'phrase'));

    select id, status into v_card
      from cards
     where user_id = v_user and language = v_lang and lower(btrim(word)) = v_head
     limit 1;

    if found then
      -- Speaking: a gap closed by a phrase I am still learning brings that card
      -- back today with my attempt. Anything else that already exists, known and
      -- mastered included, is left alone.
      if v_is_speak and v_card.status in ('new', 'learning') then
        update cards
           set next_review_at = current_date,
               my_attempt = coalesce(v_item->>'my_attempt', my_attempt)
         where id = v_card.id;
        v_refreshed := v_refreshed || to_jsonb(v_head);
      else
        v_skipped := v_skipped || jsonb_build_object('phrase', v_head, 'status', v_card.status);
      end if;
      continue;
    end if;

    insert into cards (user_id, language, word, pos, definition, patterns,
                       translation_ru, verb_forms, status, interval_days, ease_factor,
                       next_review_at, source_id, context_ts, my_attempt)
    values (
      v_user, v_lang, btrim(v_item->>'phrase'), v_item->>'pos', v_item->>'definition',
      v_item->'patterns', v_item->>'translation_ru', v_item->'verb_forms',
      'new', 1, 2.5, current_date, v_source_id,
      (v_item->>'ts')::numeric, v_item->>'my_attempt'
    )
    returning id into v_card_id;

    v_map := v_map || jsonb_build_object(v_head, v_card_id);
    v_created := v_created + 1;
  end loop;

  -- ── Exercises ─────────────────────────────────────────────────────────────
  for v_item in select * from jsonb_array_elements(v_exercises) loop
    v_head := lower(btrim(v_item->>'phrase'));
    if not (v_map ? v_head) then
      v_ex_drop := v_ex_drop + 1;  -- its phrase was skipped as a duplicate
      continue;
    end if;
    insert into exercises (user_id, source_id, card_id, kind, sentence, answers, ts, position)
    values (v_user, v_source_id, (v_map->>v_head)::uuid, v_item->>'kind',
            v_item->>'sentence', v_item->'answers', (v_item->>'ts')::numeric, v_pos);
    v_pos := v_pos + 1;
    v_ex_made := v_ex_made + 1;
  end loop;

  -- ── Used in speech ────────────────────────────────────────────────────────
  -- A phrase I said on my own counts as learned — unless the card came from
  -- this very session. Known cards stay known.
  v_date := coalesce((v_speak->>'date')::date, current_date);
  if jsonb_array_length(v_used) > 0 then
    with hit as (
      update cards c
         set used_in_speech_at = v_date::timestamptz,
             status = case when c.status in ('new', 'learning') then 'mastered' else c.status end
       where c.user_id = v_user and c.language = v_lang
         and lower(btrim(c.word)) in (select lower(btrim(x)) from jsonb_array_elements_text(v_used) x)
         and c.source_id is distinct from v_source_id
      returning c.word
    )
    select coalesce(jsonb_agg(word), '[]'::jsonb) into v_marked from hit;
  end if;

  -- ── Speaking session ──────────────────────────────────────────────────────
  if v_speak is not null then
    insert into speaking_sessions (user_id, language, source_id, date, type, minutes, wpm,
                                   gaps_per_10, restarts, ru_drops, fillers_per_min,
                                   chunks_reused, top_pattern, note)
    values (
      v_user, v_lang, v_source_id, v_date, v_speak->>'type',
      (v_speak->>'minutes')::numeric, (v_speak->>'wpm')::numeric,
      (v_speak->>'gaps_per_10')::numeric, (v_speak->>'restarts')::int,
      (v_speak->>'ru_drops')::int, (v_speak->>'fillers_per_min')::numeric,
      coalesce((v_speak->>'chunks_reused')::int,
               case when jsonb_array_length(v_used) > 0 then jsonb_array_length(v_marked) end),
      v_speak->>'top_pattern', v_speak->>'note'
    )
    returning id into v_session;
  end if;

  return jsonb_build_object(
    'source_id',           v_source_id,
    'path',                case when v_source_id is not null then '/sources/' || v_source_id end,
    'cards_created',       v_created,
    'skipped',             v_skipped,
    'refreshed',           v_refreshed,
    'exercises_created',   v_ex_made,
    'exercises_dropped',   v_ex_drop,
    'used_in_speech',      v_marked,
    'speaking_session_id', v_session
  );
end;
$$;

-- Only the service role (the Supabase connector) may import; never the browser.
revoke all on function public.import_source(jsonb) from public, anon, authenticated;
grant execute on function public.import_source(jsonb) to service_role;
