-- Patterns are phrases, not sentences.
--
-- The card follows the generate-card prompt (docs/card-rules-en.md): 2-3 short
-- patterns, no sentences. The full sentence from the source moves to its own
-- column, `context`, shown on the source page. import_source() now rejects
-- patterns that look like sentences.

alter table public.cards add column context text;  -- full source sentence, phrase in <<…>>

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
    if jsonb_array_length(v_item->'patterns') not between 2 and 3 then
      raise exception 'phrase "%": give 2-3 patterns', v_head;
    end if;
    -- Patterns are phrases, not sentences (the rules of the generate-card prompt)
    for v_s in select * from jsonb_array_elements_text(v_item->'patterns') loop
      if v_s !~ '<<[^>]+>>' then
        raise exception 'phrase "%": every pattern marks the phrase with <<…>>: %', v_head, v_s;
      end if;
      if v_s ~ '[.!?]\s*$' then
        raise exception 'pattern is a phrase, not a sentence — no full stop at the end: %', v_s;
      end if;
      if array_length(regexp_split_to_array(btrim(regexp_replace(v_s, '<<|>>', '', 'g')), '\s+'), 1) > 10 then
        raise exception 'pattern is a phrase of 3-8 words, not a sentence: %', v_s;
      end if;
      if v_lang = 'en' and v_s ~* '^\s*(i|you|he|she|it|we|they)\M' then
        raise exception 'pattern must not start with a subject pronoun: %', v_s;
      end if;
    end loop;
    if v_item ? 'context' and (v_item->>'context') !~ '<<[^>]+>>' then
      raise exception 'phrase "%": context must mark the phrase with <<…>>', v_head;
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
                       next_review_at, source_id, context, context_ts, my_attempt)
    values (
      v_user, v_lang, btrim(v_item->>'phrase'), v_item->>'pos', v_item->>'definition',
      v_item->'patterns', v_item->>'translation_ru', v_item->'verb_forms',
      'new', 1, 2.5, current_date, v_source_id, v_item->>'context',
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
